import { promises as fs } from 'fs';
import { Dirent, Stats } from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import type { MediaItem, RootKind, ScanProgress } from '../../src/shared/types';
import { toMediaUrl } from './urlUtil';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const SUPPORTED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

const NUM_WORKERS = Math.max(1, require('os').cpus().length - 1);

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function isSupported(name: string): boolean {
  return SUPPORTED_EXTS.has(getExt(name));
}

function classifyMedia(name: string): 'image' | 'video' | null {
  const ext = getExt(name);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

function extractKeywords(name: string): string[] {
  const base = path.basename(name, path.extname(name));
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of base.split(/[\s\-_.()\[\]]+/)) {
    const kw = token.toLowerCase().trim();
    if (kw.length >= 2 && !seen.has(kw)) {
      seen.add(kw);
      keywords.push(kw);
    }
  }
  return keywords;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Worker (runs in worker_threads) ──────────────────────────────────────────

interface WorkerPayload {
  rootPath: string;
  kind: RootKind;
  dir: string;
}

interface WorkerResult {
  dir: string;
  items: MediaItem[];
  newDirs: string[];
  errors: number;
}

async function buildMediaItem(
  fullPath: string,
  stat: Stats,
  rootPath: string,
  kind: RootKind,
): Promise<MediaItem | null> {
  const name = path.basename(fullPath);
  const mediaType = classifyMedia(name);
  if (!mediaType) return null;

  const ext = getExt(name);
  const rel = path.relative(rootPath, fullPath);
  const parts = rel.split(path.sep);

  let profilePath: string;
  let albumPath: string | null;

  if (kind === 'container') {
    if (parts.length === 1) {
      profilePath = rootPath;
      albumPath = null;
    } else if (parts.length === 2) {
      profilePath = path.join(rootPath, parts[0]);
      albumPath = null;
    } else {
      profilePath = path.join(rootPath, parts[0]);
      albumPath = path.join(rootPath, parts[0], parts[1]);
    }
  } else {
    profilePath = rootPath;
    albumPath = parts.length > 1 ? path.join(rootPath, parts[0]) : null;
  }

  return {
    path: fullPath,
    mediaUrl: toMediaUrl(fullPath),
    name,
    type: mediaType,
    format: ext,
    size: stat.size,
    createdAt: stat.birthtimeMs || stat.ctimeMs,
    modifiedAt: stat.mtimeMs,
    keywords: extractKeywords(name),
    rootPath,
    profilePath,
    albumPath,
  };
}

async function processDirectory(dir: string, rootPath: string, kind: RootKind): Promise<WorkerResult> {
  const items: MediaItem[] = [];
  const newDirs: string[] = [];
  let errors = 0;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { dir, items, newDirs, errors: 1 };
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    try {
      if (entry.isDirectory()) {
        // Dedup/ciclo de symlinks é responsabilidade da thread principal
        // (ela mantém o conjunto `visited` por realpath).
        newDirs.push(fullPath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          newDirs.push(fullPath);
        } else if (stat.isFile() && isSupported(entry.name)) {
          const item = await buildMediaItem(fullPath, stat, rootPath, kind);
          if (item) items.push(item);
        }
        continue;
      }
    } catch {
      errors++;
      continue;
    }

    if (!entry.isFile() || !isSupported(entry.name)) continue;

    try {
      const stat = await fs.stat(fullPath);
      const item = await buildMediaItem(fullPath, stat, rootPath, kind);
      if (item) items.push(item);
    } catch {
      errors++;
    }
  }

  return { dir, items, newDirs, errors };
}

// Worker thread entry point
if (!isMainThread && parentPort) {
  parentPort.on('message', async (payload: WorkerPayload) => {
    try {
      const result = await processDirectory(payload.dir, payload.rootPath, payload.kind);
      parentPort?.postMessage(result);
    } catch (err) {
      parentPort?.postMessage({
        dir: payload.dir,
        items: [],
        newDirs: [],
        errors: 1,
      });
    }
  });
}

// ── Main Thread ──────────────────────────────────────────────────────────────

export interface ScanCallbacks {
  onProgress(progress: ScanProgress): void;
  shouldCancel(): boolean;
}

function createWorker(): Worker {
  return new Worker(__filename);
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

/**
 * Pool persistente de workers: cria NUM_WORKERS workers uma vez e despacha
 * diretórios para o primeiro worker livre (work-stealing). Cada resultado
 * resolve a promise da tarefa correspondente; workers são encerrados no
 * `finally` de scanRoot (inclusive em cancelamento).
 */
class WorkerPool {
  private pool: PoolWorker[] = [];
  private resolvers = new Map<
    Worker,
    { dir: string; rootPath: string; kind: RootKind; resolve: (r: WorkerResult) => void }
  >();

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = createWorker();
      const pw: PoolWorker = { worker, busy: false };
      worker.on('message', (result: WorkerResult) => this.settle(worker, result));
      worker.on('error', () => {
        // Worker falhou (ex.: ambiente sem suporte a spawn): remove do pool
        // e processa a tarefa pendente inline, na thread principal.
        const task = this.resolvers.get(worker);
        this.resolvers.delete(worker);
        this.pool = this.pool.filter((p) => p.worker !== worker);
        if (task) {
          processDirectory(task.dir, task.rootPath, task.kind).then(task.resolve);
        }
      });
      this.pool.push(pw);
    }
  }

  private settle(worker: Worker, result: WorkerResult): void {
    const task = this.resolvers.get(worker);
    this.resolvers.delete(worker);
    const pw = this.pool.find((p) => p.worker === worker);
    if (pw) pw.busy = false;
    task?.resolve(result);
  }

  /** Despacha um diretório para um worker livre. Retorna null se todos ocupados. */
  dispatch(dir: string, rootPath: string, kind: RootKind): Promise<WorkerResult> | null {
    const pw = this.pool.find((p) => !p.busy);
    if (!pw) {
      // Pool morto (workers indisponíveis): processa inline como fallback
      if (this.pool.length === 0) {
        return processDirectory(dir, rootPath, kind);
      }
      return null;
    }
    pw.busy = true;
    return new Promise<WorkerResult>((resolve) => {
      this.resolvers.set(pw.worker, { dir, rootPath, kind, resolve });
      pw.worker.postMessage({ dir, rootPath, kind } as WorkerPayload);
    });
  }

  terminate(): void {
    for (const pw of this.pool) {
      pw.worker.terminate();
    }
    this.pool = [];
    this.resolvers.clear();
  }
}

export async function scanRoot(
  rootPath: string,
  callbacks: ScanCallbacks,
  kind: RootKind = 'profile',
): Promise<{ items: MediaItem[]; errors: number; cancelled: boolean }> {
  const visited = new Set<string>();
  const queue: string[] = [];
  const allItems: MediaItem[] = [];
  let scannedDirs = 0;
  let errors = 0;
  let cancelled = false;

  try {
    const rootReal = await fs.realpath(rootPath).catch(() => rootPath);
    visited.add(rootReal);
    queue.push(rootPath);
  } catch {
    return { items: [], errors: 1, cancelled: false };
  }

  const pool = new WorkerPool(NUM_WORKERS);
  const inFlight = new Set<Promise<void>>();
  // Resultados de workers que terminaram mas ainda não foram consumidos.
  // Sem este buffer, um worker que finaliza durante o handleResult de outro
  // se remove de inFlight antes do próximo Promise.race e o resultado
  // (itens + subdiretórios) é perdido silenciosamente.
  const completed: WorkerResult[] = [];

  const handleResult = async (result: WorkerResult) => {
    scannedDirs++;
    errors += result.errors;
    allItems.push(...result.items);

    if (result.items.length > 0) {
      const progress: ScanProgress = {
        rootPath,
        scannedDirs,
        foundMedia: allItems.length,
        items: result.items,
        done: false,
        cancelled,
        errors,
      };
      callbacks.onProgress(progress);
    }

    for (const newDir of result.newDirs) {
      const realPath = await fs.realpath(newDir).catch(() => newDir);
      if (!visited.has(realPath)) {
        visited.add(realPath);
        queue.push(newDir);
      }
    }
  };

  try {
    while (queue.length > 0 || inFlight.size > 0 || completed.length > 0) {
      if (callbacks.shouldCancel()) {
        cancelled = true;
        break;
      }

      // Despacha diretórios enquanto houver worker livre
      while (queue.length > 0) {
        const dir = queue[0];
        const task = pool.dispatch(dir, rootPath, kind);
        if (!task) break; // todos ocupados
        queue.shift();
        const tracked: Promise<void> = task.then((r) => {
          inFlight.delete(tracked);
          completed.push(r);
        });
        inFlight.add(tracked);
      }

      if (completed.length > 0) {
        await handleResult(completed.shift()!);
        // Cede o event loop entre resultados
        if (queue.length > 0 || inFlight.size > 0 || completed.length > 0) {
          await sleep(0);
        }
        continue;
      }

      if (inFlight.size === 0) break;

      // Aguarda o primeiro resultado disponível
      await Promise.race(inFlight);
    }
  } finally {
    pool.terminate();
  }

  // emit final progress
  const finalProgress: ScanProgress = {
    rootPath,
    scannedDirs,
    foundMedia: allItems.length,
    items: [],
    done: true,
    cancelled,
    errors,
  };
  callbacks.onProgress(finalProgress);

  return { items: allItems, errors, cancelled };
}

export { isSupported, getExt, extractKeywords, classifyMedia };
