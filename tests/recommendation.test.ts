import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { FeedPage } from '../src/shared/types';

// Fully mocked in-memory database — no native module needed
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

let mockDb: {
  media: MockRow[];
  favs: { target_type: string; target_path: string }[];
};

function resetMockDb() {
  mockDb = { media: [], favs: [] };
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
    keywords: `tag${i % 5}`,
    ...overrides,
  };
}

// Mock the db module
vi.mock('../electron/services/db', () => ({
  getDb: () => ({
    prepare: (query: string) => {
      // Parse simple SQL to match mock DB
      const q = query.trim().toLowerCase();
      return {
        get: (...args: any[]) => {
          // SELECT COUNT(*) as c FROM media_index
          if (q.includes('select count(*)') && q.includes('media_index')) {
            return { c: mockDb.media.length };
          }
          return undefined;
        },
        all: (...args: any[]) => {
          // Main scoring query — now selects path, modified_at, profile_path, album_path, score
          if (q.includes('select') && q.includes('path') && q.includes('modified_at') && q.includes('profile_path') && q.includes('album_path') && q.includes('score')) {
            let rows = [...mockDb.media];

            // Filter out served paths (NOT IN clause)
            if (q.includes('path not in')) {
              const servedPaths = args;
              rows = rows.filter((m) => !servedPaths.includes(m.path));
            }

            // Apply candidate pool limit
            const limitMatch = q.match(/limit\s+(\d+)/);
            if (limitMatch) {
              const limit = parseInt(limitMatch[1]);
              rows = rows.slice(0, limit);
            }

            return rows.map((m) => ({
              path: m.path,
              modified_at: m.modified_at,
              profile_path: m.profile_path,
              album_path: m.album_path,
              score: 0.5, // Mock score
            }));
          }

          // SELECT target_path FROM favorites WHERE target_type = 'folder'
          if (q.includes('select target_path from favorites') && q.includes("target_type = 'folder'")) {
            return mockDb.favs
              .filter((f) => f.target_type === 'folder')
              .map((f) => ({ target_path: f.target_path }));
          }

          // SELECT target_path FROM favorites WHERE target_type = 'file'
          if (q.includes('select target_path from favorites') && q.includes("target_type = 'file'")) {
            return mockDb.favs
              .filter((f) => f.target_type === 'file')
              .map((f) => ({ target_path: f.target_path }));
          }

          // SELECT DISTINCT profile_path, format, type FROM media_index WHERE path IN (...)
          if (q.includes('select distinct profile_path, format, type')) {
            return mockDb.media
              .filter((m) => args.includes(m.path))
              .map((m) => ({
                profile_path: m.profile_path,
                format: m.format,
                type: m.type,
              }));
          }

          // SELECT path, root_path, profile_path, album_path, type, format, size, created_at, keywords FROM media_index WHERE path IN (...)
          if (q.includes('select path, root_path, profile_path, album_path, type, format, size, created_at, keywords')) {
            return mockDb.media.filter((m) => args.includes(m.path));
          }

          return [];
        },
        run: (...args: any[]) => {
          return { changes: 1 };
        },
      };
    },
    pragma: () => 1,
    exec: () => {},
    transaction: (fn: () => void) => {
      return () => fn();
    },
  }),
}));

// Now import the module under test (after mock is defined)
import { getForYouPage } from '../electron/services/recommendation';

describe('recommendation - For You feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna pagina vazia quando nao ha midias', () => {
    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    expect(page!.items).toHaveLength(0);
    expect(page!.nextCursor).toBeNull();
  });

  it('retorna ate PAGE_SIZE itens', () => {
    const items = Array.from({ length: 50 }, (_, i) => makeMockItem(i));
    mockDb.media = items;

    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    expect(page!.items.length).toBeLessThanOrEqual(20);
    expect(page!.items.length).toBeGreaterThan(0);
    expect(page!.nextCursor).not.toBeNull();
  });

  it('pagina com cursor', () => {
    const items = Array.from({ length: 50 }, (_, i) => makeMockItem(i));
    mockDb.media = items;

    const page1 = getForYouPage(undefined);
    expect(page1!.items.length).toBeGreaterThan(0);
    const cursor = page1!.nextCursor;
    expect(cursor).not.toBeNull();

    const page2 = getForYouPage(cursor!);
    expect(page2!.items.length).toBeGreaterThan(0);

    // verify cursor advances differently from page1
    expect(page2!.nextCursor).not.toBe(cursor);
  });

  it('retorna cursor null quando todos os itens foram consumidos', () => {
    // Use multiple profiles so diversity constraints don't block exhaustion
    const items = Array.from({ length: 8 }, (_, i) =>
      makeMockItem(i, {
        profile_path: `/root${i}/creator${i}`,
      }),
    );
    mockDb.media = items;

    let cursor: string | null | undefined;
    let totalDelivered = 0;
    let pagesFetched = 0;
    const maxPages = 10;

    cursor = undefined;
    while (pagesFetched < maxPages) {
      const page = getForYouPage(cursor);
      pagesFetched++;
      if (!page || page.items.length === 0) break;
      totalDelivered += page.items.length;
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    // At least some items delivered and no infinite loop
    expect(totalDelivered).toBeGreaterThan(0);
    expect(pagesFetched).toBeLessThan(maxPages);
  });

  it('cursor com sessao expirada cria nova sessao', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeMockItem(i));
    mockDb.media = items;

    // Session ID 'nonexistent' does not exist → creates new session and returns first page
    const page = getForYouPage('c:nonexistent:99999');
    expect(page).not.toBeNull();
    // With an unknown session, a new one is created and items are returned
    expect(page!.items.length).toBeGreaterThan(0);
  });

  it('inclui metadados corretos nos itens retornados', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeMockItem(i, {
        path: `/media/img${i}.png`,
        type: 'image',
        format: 'png',
      }),
    );
    mockDb.media = items;

    const page = getForYouPage(undefined);
    expect(page!.items.length).toBeGreaterThan(0);
    for (const item of page!.items) {
      expect(item.type).toBe('image');
      expect(item.format).toBe('png');
      expect(item.mediaUrl).toMatch(/^media:\/\//);
      expect(item.name).toBeTruthy();
      expect(item.size).toBeGreaterThan(0);
    }
  });

  it('respeita limite de itens por perfil (max 3)', () => {
    // 20 items all from the same profile
    const items = Array.from({ length: 20 }, (_, i) =>
      makeMockItem(i, {
        profile_path: '/root0/creator0',
      }),
    );
    mockDb.media = items;

    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    // Should be limited to MAX_PER_PROFILE (3) even though we have 20 items from the same profile
    expect(page!.items.length).toBeLessThanOrEqual(3);
  });

  it('respeita limite de itens por album (max 2)', () => {
    // 20 items all from the same album and different profiles
    const items = Array.from({ length: 20 }, (_, i) =>
      makeMockItem(i, {
        profile_path: `/root${i}/creator${i}`,
        album_path: '/root0/album0',
      }),
    );
    mockDb.media = items;

    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    // Should be limited to MAX_PER_ALBUM (2) even though we have 20 items from the same album
    expect(page!.items.length).toBeLessThanOrEqual(2);
  });

  it('inclui itens antigos quando ha itens recentes e antigos', () => {
    const now = Date.now();
    // 30 recent items (within 30 days)
    const recent = Array.from({ length: 30 }, (_, i) =>
      makeMockItem(i, {
        modified_at: now - 86_400_000 * i, // i days ago
      }),
    );
    // 30 old items (older than 30 days)
    const old = Array.from({ length: 30 }, (_, i) =>
      makeMockItem(i + 30, {
        profile_path: `/root${i % 10}/creator${i % 5}`,
        modified_at: now - 86_400_000 * (30 + i), // 30+i days ago
      }),
    );
    mockDb.media = [...recent, ...old];

    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    expect(page!.items.length).toBeGreaterThan(0);

    // Check that we have a mix of recent and old items
    const recentItems = page!.items.filter((item) => (now - item.modifiedAt) < 30 * 86_400_000);
    const oldItems = page!.items.filter((item) => (now - item.modifiedAt) >= 30 * 86_400_000);

    expect(recentItems.length).toBeGreaterThan(0);
    expect(oldItems.length).toBeGreaterThan(0);
  });

  it('permite diversidade de perfis quando ha múltiplos perfis', () => {
    // 60 items from 10 different profiles (6 per profile)
    const items = Array.from({ length: 60 }, (_, i) =>
      makeMockItem(i, {
        profile_path: `/root${i % 10}/creator${i % 10}`,
      }),
    );
    mockDb.media = items;

    const page = getForYouPage(undefined);
    expect(page).not.toBeNull();
    expect(page!.items.length).toBeGreaterThan(3); // Should get items from multiple profiles

    // Count unique profiles
    const profiles = new Set(page!.items.map((item) => item.profilePath));
    expect(profiles.size).toBeGreaterThan(1); // At least 2 different profiles
  });
});
