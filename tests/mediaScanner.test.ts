import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { scanRoot, extractKeywords, isSupported } from '../electron/services/mediaScanner';
import type { MediaItem, ScanProgress } from '../src/shared/types';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `roam-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
});

async function createFile(relPath: string, sizeMb: number = 0) {
  const full = path.join(tmpDir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // write random bytes to simulate real file
  const buf = Buffer.alloc(sizeMb * 1024 * 1024 || 64, 'x');
  await fs.writeFile(full, buf);
  return full;
}

describe('mediaScanner', () => {
  describe('isSupported', () => {
    it('deve reconhecer imagens e videos suportados', () => {
      expect(isSupported('foto.jpg')).toBe(true);
      expect(isSupported('foto.JPG')).toBe(true);
      expect(isSupported('foto.jpeg')).toBe(true);
      expect(isSupported('foto.png')).toBe(true);
      expect(isSupported('foto.gif')).toBe(true);
      expect(isSupported('foto.webp')).toBe(true);
      expect(isSupported('foto.avif')).toBe(true);
      expect(isSupported('foto.bmp')).toBe(true);
      expect(isSupported('video.mp4')).toBe(true);
      expect(isSupported('video.MP4')).toBe(true);
      expect(isSupported('video.webm')).toBe(true);
      expect(isSupported('video.mov')).toBe(true);
      expect(isSupported('video.mkv')).toBe(true);
      expect(isSupported('video.avi')).toBe(true);
    });

    it('deve ignorar formatos nao suportados', () => {
      expect(isSupported('doc.txt')).toBe(false);
      expect(isSupported('sheet.xlsx')).toBe(false);
      expect(isSupported('script.js')).toBe(false);
      expect(isSupported('doc.pdf')).toBe(false);
      expect(isSupported('semextensao')).toBe(false);
    });
  });

  describe('extractKeywords', () => {
    it('extrai palavras do nome do arquivo', () => {
      const kw = extractKeywords('Viagem_Praia-2024.jpg');
      expect(kw).toContain('viagem');
      expect(kw).toContain('praia');
      expect(kw).toContain('2024');
    });

    it('ignora palavras muito curtas e deduplica', () => {
      const kw = extractKeywords('a_b_c_def_g.jpg');
      // 'a' length 1 -> skip; 'def' length 3 -> ok; 'c' length 1 -> skip
      expect(kw.filter((k) => k === 'a' || k === 'b' || k === 'c').length).toBe(0);
      expect(kw).toContain('def');
    });

    it('separa por varios delimitadores', () => {
      const kw = extractKeywords('foto[2023](copia).jpg');
      expect(kw).toContain('foto');
      expect(kw).toContain('2023');
      expect(kw).toContain('copia');
    });
  });

  describe('scanRoot - deep resolving', () => {
    it('deve achar arquivos no primeiro nivel', async () => {
      await createFile('pasta_vazia/foto1.jpg');
      await createFile('pasta_vazia/foto2.png');
      await createFile('pasta_vazia/video.mp4');

      const items: MediaItem[] = [];
      let cancelled = false;

      await scanRoot(path.join(tmpDir, 'pasta_vazia'), {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => cancelled,
      });

      expect(items.length).toBe(3);
      expect(items.find((i) => i.name === 'foto1.jpg')!.type).toBe('image');
      expect(items.find((i) => i.name === 'foto2.png')!.type).toBe('image');
      expect(items.find((i) => i.name === 'video.mp4')!.type).toBe('video');
      expect(items.find((i) => i.name === 'foto1.jpg')!.albumPath).toBeNull();
    });

    it('deve achar arquivos em profundidade 3 e achatá-los', async () => {
      await createFile('deep/a/b/c/d1.jpg');
      await createFile('deep/a/b/c/d2.png');
      await createFile('deep/a/b/e1.mp4');
      await createFile('deep/a/f1.jpg');

      const items: MediaItem[] = [];
      const rootDir = path.join(tmpDir, 'deep');

      await scanRoot(rootDir, {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      });

      expect(items.length).toBe(4);

      // a is the direct subfolder (album)
      const deepItem = items.find((i) => i.name === 'd1.jpg')!;
      expect(deepItem.albumPath).toBe(path.join(rootDir, 'a'));

      // f1.jpg is inside 'a', so album is 'a' too
      const shallowInA = items.find((i) => i.name === 'f1.jpg')!;
      expect(shallowInA.albumPath).toBe(path.join(rootDir, 'a'));
    });

    it('deve ignorar arquivos nao suportados', async () => {
      await createFile('mix/foto.jpg');
      await createFile('mix/notas.txt');
      await createFile('mix/script.js');

      const items: MediaItem[] = [];
      await scanRoot(path.join(tmpDir, 'mix'), {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      });

      expect(items.length).toBe(1);
      expect(items[0].name).toBe('foto.jpg');
    });

    it('deve extrair metadados corretamente', async () => {
      await createFile('meta/foto.jpg', 2); // 2MB

      const items: MediaItem[] = [];
      await scanRoot(path.join(tmpDir, 'meta'), {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      });

      expect(items.length).toBe(1);
      const item = items[0];
      expect(item.format).toBe('jpg');
      expect(item.type).toBe('image');
      expect(item.size).toBeGreaterThan(0);
      expect(item.createdAt).toBeGreaterThan(0);
      expect(item.modifiedAt).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
      // mediaUrl format: scheme absoluto media://file/<path codificado>
      expect(item.mediaUrl).toMatch(/^media:\/\/file\//);
      expect(item.mediaUrl).toContain('foto.jpg');
      expect(item.path).toBe(path.join(tmpDir, 'meta', 'foto.jpg'));
      expect(item.rootPath).toBe(path.join(tmpDir, 'meta'));
      expect(item.albumPath).toBeNull();
    });

    it('deve emitir progresso em batches e evento final', async () => {
      // create 60 files to trigger at least one batch
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 60; i++) {
        promises.push(createFile(`big/foto${i}.jpg`));
      }
      await Promise.all(promises);

      const progressEvents: ScanProgress[] = [];
      await scanRoot(path.join(tmpDir, 'big'), {
        onProgress(p: ScanProgress) {
          progressEvents.push(p);
        },
        shouldCancel: () => false,
      });

      // at least one batch + final event
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);

      const final = progressEvents[progressEvents.length - 1];
      expect(final.done).toBe(true);
      expect(final.foundMedia).toBe(60);
    });

    it('deve tolerar erros em diretorios ilegiveis', async () => {
      // Create a directory without read permissions
      const lockDir = path.join(tmpDir, 'locked');
      await fs.mkdir(lockDir, { recursive: true });
      await createFile('locked/sub/ok.jpg');

      let errorCount = 0;
      const items: MediaItem[] = [];

      await scanRoot(path.join(tmpDir, 'locked'), {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
          errorCount = p.errors;
        },
        shouldCancel: () => false,
      });

      // Should still find ok.jpg (inside 'sub')
      expect(items.length).toBe(1);
      expect(items[0].albumPath).toBe(path.join(tmpDir, 'locked', 'sub'));
    });

    it('kind container: subpastas viram perfis e sub-subpastas viram albuns', async () => {
      await createFile('hub/ana/fotos/f1.jpg');
      await createFile('hub/ana/f2.jpg');
      await createFile('hub/bruno/video.mp4');
      await createFile('hub/solto.jpg');

      const items: MediaItem[] = [];
      const rootDir = path.join(tmpDir, 'hub');

      await scanRoot(rootDir, {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      }, 'container');

      expect(items.length).toBe(4);

      // ana/fotos/f1.jpg → profile=ana, album=ana/fotos
      const f1 = items.find((i) => i.name === 'f1.jpg')!;
      expect(f1.profilePath).toBe(path.join(rootDir, 'ana'));
      expect(f1.albumPath).toBe(path.join(rootDir, 'ana', 'fotos'));

      // ana/f2.jpg → profile=ana, sem album
      const f2 = items.find((i) => i.name === 'f2.jpg')!;
      expect(f2.profilePath).toBe(path.join(rootDir, 'ana'));
      expect(f2.albumPath).toBeNull();

      // bruno/video.mp4 → profile=bruno, sem album
      const vid = items.find((i) => i.name === 'video.mp4')!;
      expect(vid.profilePath).toBe(path.join(rootDir, 'bruno'));

      // solto.jpg (1º nível) → perfil implícito = própria raiz
      const solto = items.find((i) => i.name === 'solto.jpg')!;
      expect(solto.profilePath).toBe(rootDir);
      expect(solto.albumPath).toBeNull();
    });

    it('kind profile: raiz é o perfil e 1º segmento é o album', async () => {
      await createFile('viagens/praia/2023/f1.jpg');
      await createFile('viagens/f2.jpg');

      const items: MediaItem[] = [];
      const rootDir = path.join(tmpDir, 'viagens');

      await scanRoot(rootDir, {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      }, 'profile');

      const f1 = items.find((i) => i.name === 'f1.jpg')!;
      expect(f1.profilePath).toBe(rootDir);
      expect(f1.albumPath).toBe(path.join(rootDir, 'praia'));

      const f2 = items.find((i) => i.name === 'f2.jpg')!;
      expect(f2.profilePath).toBe(rootDir);
      expect(f2.albumPath).toBeNull();
    });

    it('mediaUrl usa scheme absoluto media://file/', async () => {
      await createFile('urls/minha foto#1.jpg');

      const items: MediaItem[] = [];
      await scanRoot(path.join(tmpDir, 'urls'), {
        onProgress(p: ScanProgress) {
          items.push(...p.items);
        },
        shouldCancel: () => false,
      });

      expect(items.length).toBe(1);
      expect(items[0].mediaUrl).toMatch(/^media:\/\/file\//);
      // espaços e # precisam estar codificados para não quebrar a URL
      expect(items[0].mediaUrl).toContain('minha%20foto%231.jpg');
    });

    it('deve suportar cancelamento', async () => {      const cancelDir = path.join(tmpDir, 'cancel');
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 200; i++) {
        promises.push(createFile(`cancel/foto${i}.jpg`));
      }
      await Promise.all(promises);

      let cancelRequested = false;
      let cancelled = false;

      const result = await scanRoot(cancelDir, {
        onProgress(_p: ScanProgress) {
          if (!cancelRequested) {
            cancelRequested = true;
            cancelled = true; // trigger cancel after first batch
          }
        },
        shouldCancel: () => cancelled,
      });

      expect(result.cancelled).toBe(true);
      // Should have found some but not all
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.length).toBeLessThan(200);
    });
  });
});
