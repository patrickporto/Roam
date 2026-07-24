import { protocol } from 'electron';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import path from 'path';
import { getDb } from './db';

const registeredRoots = new Set<string>();

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

/**
 * Resolve a URL media://file/<caminho-absoluto-codificado> de volta ao
 * caminho absoluto no disco. Retorna null se malformada.
 */
function parseMediaUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'media:' || url.hostname !== 'file') return null;

  const segments = url.pathname
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
  if (segments.length === 0) return null;

  let candidate = segments.join(path.sep);
  // caminhos UNC (\\servidor\share) perdem a barra dupla inicial no split
  if (url.pathname.startsWith('//')) {
    candidate = path.sep + candidate;
  }
  return path.normalize(candidate);
}

function isInsideRoots(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  for (const root of registeredRoots) {
    const r = root.toLowerCase();
    if (lower === r || lower.startsWith(r + path.sep)) return true;
  }
  return false;
}

export function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const filePath = parseMediaUrl(request.url);
    if (!filePath || !isInsideRoots(filePath)) {
      return new Response('Not found', { status: 404 });
    }

    let st;
    try {
      st = await stat(filePath);
      if (!st.isFile()) return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    const size = st.size;

    const range = request.headers.get('range');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        let start: number;
        let end: number;
        if (m[1] === '' && m[2] !== '') {
          // suffix-range: bytes=-N → últimos N bytes
          start = Math.max(0, size - parseInt(m[2], 10));
          end = size - 1;
        } else {
          start = m[1] ? parseInt(m[1], 10) : 0;
          end = m[2] ? parseInt(m[2], 10) : size - 1;
        }
        if (Number.isNaN(start) || Number.isNaN(end) || start >= size || start > end) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          });
        }
        end = Math.min(end, size - 1);
        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }

    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

export function refreshRoots(): void {
  registeredRoots.clear();
  const db = getDb();
  const rows = db.prepare(`SELECT path FROM roots`).all() as { path: string }[];
  for (const row of rows) {
    registeredRoots.add(path.resolve(row.path));
  }
}
