import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock em memória do módulo db (sem módulo nativo)
interface MockRow {
  path: string;
  root_path: string;
  profile_path: string;
  album_path: string | null;
  type: string;
  format: string;
  size: number;
  created_at: number;
  modified_at: number;
  keywords: string;
}

interface ItemTagRow { tag_id: number; target_type: string; target_path: string }

let mockDb: {
  media: MockRow[];
  itemTags: ItemTagRow[];
};

function resetMockDb() {
  mockDb = { media: [], itemTags: [] };
}

function makeMockItem(i: number, overrides: Partial<MockRow> = {}): MockRow {
  return {
    path: `/media/file${i}.jpg`,
    root_path: `/root${i % 3}`,
    profile_path: `/root${i % 3}/creator${i % 2}`,
    album_path: null,
    type: 'image',
    format: 'jpg',
    size: 100_000,
    created_at: Date.now() - 86_400_000 * i,
    modified_at: Date.now() - 86_400_000 * i,
    keywords: '',
    ...overrides,
  };
}

/** Itens que pertencem à tag: arquivos tageados + mídias sob pastas tageadas. */
function tagMatches(path: string, tagId: number): boolean {
  return mockDb.itemTags.some((it) => {
    if (it.tag_id !== tagId) return false;
    if (it.target_type === 'file') return it.target_path === path;
    return path.startsWith(it.target_path + '/') || path.startsWith(it.target_path + '\\');
  });
}

vi.mock('../electron/services/db', () => ({
  getDb: () => ({
    prepare: (query: string) => {
      const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
      return {
        get: (...args: any[]) => {
          // SELECT COUNT(*) ... FROM media_index (com ou sem filtro de tag)
          if (q.includes('count(*)') && q.includes('media_index')) {
            if (q.includes('item_tags where tag_id')) {
              const tagId = args.find((a) => typeof a === 'number') as number;
              return { c: mockDb.media.filter((m) => tagMatches(m.path, tagId)).length };
            }
            return { c: mockDb.media.length };
          }
          return undefined;
        },
        all: (...args: any[]) => {
          // Query de scoring (CTE com score)
          if (q.includes('score') && q.includes('profile_path') && q.includes('album_path')) {
            let rows = [...mockDb.media];

            // Exclusão de servidos (path NOT IN)
            if (q.includes('path not in')) {
              rows = rows.filter((m) => !args.includes(m.path));
            }

            // Filtro de tag (cláusula com item_tags tag_id)
            if (q.includes('item_tags where tag_id')) {
              const tagId = args.find((a) => typeof a === 'number') as number;
              rows = rows.filter((m) => tagMatches(m.path, tagId));
            }

            const limitMatch = q.match(/limit\s+(\d+)/);
            if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]));

            return rows.map((m) => ({
              path: m.path,
              modified_at: m.modified_at,
              profile_path: m.profile_path,
              album_path: m.album_path,
              score: 0.5,
            }));
          }

          // SELECT target_path FROM item_tags WHERE tag_id = ? AND target_type = 'folder'
          if (q.includes('select target_path from item_tags where tag_id')) {
            const [tagId] = args;
            return mockDb.itemTags
              .filter((it) => it.tag_id === tagId && it.target_type === 'folder')
              .map((it) => ({ target_path: it.target_path }));
          }

          // SELECT DISTINCT target_path FROM item_tags WHERE target_type = 'folder'
          if (q.includes('select distinct target_path from item_tags')) {
            return mockDb.itemTags
              .filter((it) => it.target_type === 'folder')
              .map((it) => ({ target_path: it.target_path }));
          }

          // Favorites: vazio neste teste
          if (q.includes('from favorites')) return [];
          if (q.includes('select distinct profile_path, format, type')) return [];

          // Hydrate: SELECT path, root_path, profile_path, album_path, type, format, size, created_at, keywords
          if (q.includes('select path, root_path, profile_path, album_path, type, format, size, created_at, keywords')) {
            return mockDb.media.filter((m) => args.includes(m.path));
          }

          return [];
        },
        run: () => ({ changes: 1 }),
      };
    },
  }),
}));

import { getTagFeedPage, clearFeedSessions } from '../electron/services/recommendation';

describe('recommendation - feed por tag', () => {
  beforeEach(() => {
    resetMockDb();
    clearFeedSessions();
  });

  it('retorna página vazia quando a tag não tem itens', () => {
    mockDb.media = Array.from({ length: 10 }, (_, i) => makeMockItem(i));
    const page = getTagFeedPage(1, undefined);
    expect(page).not.toBeNull();
    expect(page!.items).toHaveLength(0);
    expect(page!.nextCursor).toBeNull();
  });

  it('retorna apenas arquivos tageados individualmente', () => {
    mockDb.media = Array.from({ length: 10 }, (_, i) =>
      makeMockItem(i, { profile_path: `/root${i}/creator${i}` }),
    );
    mockDb.itemTags = [
      { tag_id: 1, target_type: 'file', target_path: '/media/file0.jpg' },
      { tag_id: 1, target_type: 'file', target_path: '/media/file5.jpg' },
    ];

    const page = getTagFeedPage(1, undefined);
    expect(page!.items).toHaveLength(2);
    const paths = page!.items.map((i) => i.path).sort();
    expect(paths).toEqual(['/media/file0.jpg', '/media/file5.jpg']);
  });

  it('tag de pasta inclui conteúdo achatado (subpastas)', () => {
    mockDb.media = [
      makeMockItem(0, { path: '/viagens/a.jpg', profile_path: '/viagens' }),
      makeMockItem(1, { path: '/viagens/praia/b.jpg', profile_path: '/viagens', album_path: '/viagens/praia' }),
      makeMockItem(2, { path: '/viagens/praia/fotos/c.jpg', profile_path: '/viagens', album_path: '/viagens/praia' }),
      makeMockItem(3, { path: '/outros/d.jpg', profile_path: '/outros' }),
    ];
    mockDb.itemTags = [{ tag_id: 1, target_type: 'folder', target_path: '/viagens' }];

    const page = getTagFeedPage(1, undefined);
    const paths = page!.items.map((i) => i.path).sort();
    expect(paths).toEqual(['/viagens/a.jpg', '/viagens/praia/b.jpg', '/viagens/praia/fotos/c.jpg']);
  });

  it('união arquivo+pasta sem duplicatas', () => {
    mockDb.media = [
      makeMockItem(0, { path: '/viagens/a.jpg', profile_path: '/viagens' }),
      makeMockItem(1, { path: '/viagens/b.jpg', profile_path: '/viagens' }),
      makeMockItem(2, { path: '/solto/c.jpg', profile_path: '/solto' }),
    ];
    mockDb.itemTags = [
      { tag_id: 1, target_type: 'folder', target_path: '/viagens' },
      { tag_id: 1, target_type: 'file', target_path: '/viagens/a.jpg' }, // também sob a pasta
      { tag_id: 1, target_type: 'file', target_path: '/solto/c.jpg' },
    ];

    const page = getTagFeedPage(1, undefined);
    const paths = page!.items.map((i) => i.path).sort();
    expect(paths).toEqual(['/solto/c.jpg', '/viagens/a.jpg', '/viagens/b.jpg']);
    // sem duplicatas
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('pagina sem repetir itens e esgota com cursor null', () => {
    mockDb.media = Array.from({ length: 8 }, (_, i) =>
      makeMockItem(i, { profile_path: `/root${i}/creator${i}` }),
    );
    mockDb.itemTags = mockDb.media.map((m) => ({
      tag_id: 1,
      target_type: 'file',
      target_path: m.path,
    }));

    const seen = new Set<string>();
    let cursor: string | null | undefined = undefined;
    let pages = 0;

    while (pages < 10) {
      const page = getTagFeedPage(1, cursor);
      pages++;
      if (!page || page.items.length === 0) {
        expect(page!.nextCursor).toBeNull();
        break;
      }
      for (const item of page.items) {
        expect(seen.has(item.path)).toBe(false);
        seen.add(item.path);
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(seen.size).toBe(8);
  });

  it('sessão de tag não colide com sessão de outra tag', () => {
    mockDb.media = Array.from({ length: 6 }, (_, i) =>
      makeMockItem(i, { profile_path: `/root${i}/creator${i}` }),
    );
    mockDb.itemTags = [
      { tag_id: 1, target_type: 'file', target_path: '/media/file0.jpg' },
      { tag_id: 2, target_type: 'file', target_path: '/media/file1.jpg' },
    ];

    const page1 = getTagFeedPage(1, undefined);
    expect(page1!.items.map((i) => i.path)).toEqual(['/media/file0.jpg']);

    // Cursor da tag 1 usado na tag 2 → não reutiliza sessão errada
    const page2 = getTagFeedPage(2, page1!.nextCursor ?? undefined);
    expect(page2!.items.map((i) => i.path)).toEqual(['/media/file1.jpg']);
  });
});
