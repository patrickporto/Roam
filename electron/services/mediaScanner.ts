import { promises as fs } from 'fs';
import { Dirent, Stats } from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import type { MediaItem, RootKind, ScanProgress } from '../../src/shared/types';
import { toMediaUrl } from './urlUtil';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const SUPPORTED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

const BATCH_SIZE = 50;
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
  visited: Set<string>;
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

async function processDirectory(dir: string, rootPath: string, kind: RootKind, visited: Set<string>): Promise<WorkerResult> {
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
        const realPath = await fs.realpath(fullPath).catch(() => fullPath);
        if (!visited.has(realPath)) {
          visited.add(realPath);
          newDirs.push(fullPath);
        }
        continue;
      }

      if (entry.isSymbolicLink()) {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          const realPath = await fs.realpath(fullPath).catch(() => fullPath);
          if (!visited.has(realPath)) {
            visited.add(realPath);
            newDirs.push(fullPath);
          }
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
      const result = await processDirectory(
        payload.dir,
        payload.rootPath,
        payload.kind,
        payload.visited,
      );
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
  return new Worker(__filename, {
    workerData: {},
  });
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

  // Process directories in parallel using worker threads
  const processBatch = async (batch: string[]) => {
    const workers: Array<{ worker: Worker; dir: string }> = [];
    const results: WorkerResult[] = [];

    for (const dir of batch) {
      const worker = createWorker();
      workers.push({ worker, dir });

      const result = await new Promise<WorkerResult>((resolve) => {
        worker.once('message', (msg: WorkerResult) => resolve(msg));
        worker.once('error', () => resolve({ dir, items: [], newDirs: [], errors: 1 }));
        worker.postMessage({ dir, rootPath, kind, visited: new Set(visited) } as any);
      });

      results.push(result);
      worker.terminate();
    }

    return results;
  };

  while (queue.length > 0) {
    if (callbacks.shouldCancel()) {
      cancelled = true;
      break;
    }

    // Process up to NUM_WORKERS directories in parallel
    const batch = queue.splice(0, NUM_WORKERS);
    const results = await processBatch(batch);

    for (const result of results) {
      scannedDirs++;
      errors += result.errors;

      // Add new items
      allItems.push(...result.items);

      // Emit progress for this batch
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

      // Add new directories to queue
      for (const newDir of result.newDirs) {
        // Check visited again (worker may have been created before we updated it)
        const realPath = await fs.realpath(newDir).catch(() => newDir);
        if (!visited.has(realPath)) {
          visited.add(realPath);
          queue.push(newDir);
        }
      }
    }

    // Yield between batches
    if (queue.length > 0) {
      await sleep(0);
    }
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
