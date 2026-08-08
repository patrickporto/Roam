import type {
  RoamApi,
  MediaItem,
  Profile,
  FeedPage,
  FavoritesSnapshot,
  MediaScope,
  FavoriteTargetType,
  Tag,
  TagSummary,
  TagTargetType,
  RootKind,
} from './shared/types';

/**
 * Resolve a API do app.
 * - Dentro do Electron: usa window.roam (preload/contextBridge).
 * - No browser em modo dev (vite): instala um mock em memória para preview da UI.
 * - Fora desses casos: lança erro com instrução clara.
 */
export function getApi(): RoamApi {
  if (typeof window !== 'undefined' && window.roam) {
    return window.roam;
  }
  if (import.meta.env.DEV) {
    return installMockApi();
  }
  throw new Error(
    'Roam API indisponível. Este app precisa rodar dentro do Electron (npm run dev).',
  );
}

export function isApiAvailable(): boolean {
  return (
    (typeof window !== 'undefined' && !!window.roam) || import.meta.env.DEV
  );
}

// ── Mock de desenvolvimento (browser puro) ───────────────────────────────────

let mockInstalled = false;

function installMockApi(): RoamApi {
  if (mockInstalled && window.roam) return window.roam;

  const favFiles = new Set<string>();
  const favFolders = new Set<string>();

  // raiz container: subpastas viram perfis
  const containerRoot = 'C:/Mock/Criadores';
  const profileNames = ['ana.silva', 'bruno_films', 'carla.shots'];
  const albumNames: Record<string, string[]> = {
    'ana.silva': ['praia', 'estudio'],
    bruno_films: ['urbano'],
    'carla.shots': [],
  };

  const allItems: MediaItem[] = [];
  let hue = 0;
  const captions = [
    'golden hour', 'take 03', 'sem filtro', 'melhor dia', 'bastidores',
    'final de tarde', 'teste de luz', 'espontânea',
  ];

  for (const prof of profileNames) {
    const profilePath = `${containerRoot}/${prof}`;
    const scopes: (string | null)[] = [null, ...(albumNames[prof] ?? [])];
    for (const album of scopes) {
      const albumPath = album ? `${profilePath}/${album}` : null;
      for (let i = 0; i < 10; i++) {
        hue = (hue + 41) % 360;
        const name = `${captions[(hue + i) % captions.length]} ${100 + i}.jpg`;
        allItems.push({
          path: `${albumPath ?? profilePath}/${name}`,
          mediaUrl: svgPlaceholder(`${prof}`, hue),
          name,
          type: 'image',
          format: 'jpg',
          size: 250_000 + i * 12_345,
          createdAt: Date.now() - 86_400_000 * (i * 9 + (album ? 4 : 40)),
          modifiedAt: Date.now() - 86_400_000 * (i * 9 + (album ? 4 : 40)),
          keywords: name.toLowerCase().split(/[\s\-_.()]+/).filter((k) => k.length >= 2),
          rootPath: containerRoot,
          profilePath,
          albumPath,
        });
      }
    }
  }

  const shuffled = [...allItems].sort(() => Math.random() - 0.5);

  const paginate = (
    items: MediaItem[],
    cursor: string | undefined,
  ): FeedPage => {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const page = items.slice(offset, offset + 20);
    const next = offset + 20 < items.length ? String(offset + 20) : null;
    return { items: page, nextCursor: next };
  };

  const buildProfile = (profilePath: string): Profile => {
    const items = allItems.filter((i) => i.profilePath === profilePath);
    const albums = [...new Set(items.filter((i) => i.albumPath).map((i) => i.albumPath!))];
    return {
      rootPath: containerRoot,
      rootKind: 'container' as const,
      profilePath,
      username: profilePath.split('/').pop()!,
      coverUrl: items[0]?.mediaUrl ?? null,
      mediaCount: items.length,
      modifiedAt: items.reduce((max, i) => Math.max(max, i.modifiedAt), 0),
      albums: albums.map((a) => {
        const albumItems = items.filter((i) => i.albumPath === a);
        return {
          path: a,
          name: a.split('/').pop()!,
          coverUrl: albumItems[0]?.mediaUrl ?? null,
          mediaCount: albumItems.length,
          isFavorite: favFolders.has(a),
        };
      }),
      isFavorite: favFolders.has(profilePath),
    };
  };

  const api: RoamApi = {
    library: {
      pickFolder: async () => 'C:/Mock/NovaPasta',
      addRoot: async (_path: string, _kind: RootKind) =>
        profileNames.map((p) => buildProfile(`${containerRoot}/${p}`)),
      removeRoot: async () => {},
      updateRootKind: async (_rootPath: string, _kind: RootKind) =>
        profileNames.map((p) => buildProfile(`${containerRoot}/${p}`)),
      list: async () => profileNames.map((p) => buildProfile(`${containerRoot}/${p}`)),
      getProfile: async (profilePath: string) => buildProfile(profilePath),
      listMedia: async (scope: MediaScope, cursor?: string, order?: 'recent' | 'oldest' | 'recommended') => {
        let items = allItems.filter((i) =>
          scope.albumPath
            ? i.albumPath === scope.albumPath
            : i.profilePath === scope.profilePath,
        );
        console.log('[API] listMedia', { scope, cursor, totalItems: items.length });
        // Apply sorting
        if (order === 'oldest') {
          items = [...items].sort((a, b) => a.modifiedAt - b.modifiedAt);
        } else if (order === 'recommended') {
          // TikTok-like: favorites first, then recency, with slight randomness
          items = [...items].map(item => ({
            item,
            score: 0.45 * (1 / (1 + (Date.now() - item.modifiedAt) / 864000000))
                  + 0.45 * (favFiles.has(item.path) ? 1 : 0)
                  + 0.1 * Math.random(),
          })).sort((a, b) => b.score - a.score).map(x => x.item);
        } else {
          // 'recent' (default)
          items = [...items].sort((a, b) => b.modifiedAt - a.modifiedAt);
        }
        return paginate(items, cursor);
      },
    },
    feed: {
      forYou: async (cursor?: string) => paginate(shuffled, cursor),
      resetSession: async () => {},
    },
    favorites: {
      toggle: async (targetType: FavoriteTargetType, targetPath: string) => {
        const set = targetType === 'file' ? favFiles : favFolders;
        if (set.has(targetPath)) {
          set.delete(targetPath);
          return false;
        }
        set.add(targetPath);
        return true;
      },
      list: async (): Promise<FavoritesSnapshot> => ({
        files: [...favFiles],
        folders: [...favFolders],
      }),
      media: async (cursor?: string) => {
        const favItems = allItems.filter((i) => favFiles.has(i.path));
        return paginate(favItems, cursor);
      },
    },
    tags: (() => {
      let nextId = 1;
      const tags = new Map<number, Tag>();
      const links = new Set<string>(); // `${tagId}|${type}|${path}`
      const byName = (name: string) =>
        [...tags.values()].find((t) => t.name.toLowerCase() === name.toLowerCase());
      const pathsForTag = (tagId: number): Set<string> =>
        new Set(
          [...links]
            .filter((l) => l.startsWith(`${tagId}|`))
            .map((l) => l.split('|').slice(2).join('|')),
        );
      return {
        list: async (): Promise<TagSummary[]> =>
          [...tags.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => {
              const paths = pathsForTag(t.id);
              const count = allItems.filter((i) =>
                [...paths].some((p) => i.path === p || i.path.startsWith(p + '/')),
              ).length;
              return { ...t, itemCount: count };
            }),
        forItem: async (targetType: TagTargetType, targetPath: string): Promise<Tag[]> =>
          [...links]
            .filter((l) => l.endsWith(`|${targetType}|${targetPath}`))
            .map((l) => tags.get(Number(l.split('|')[0]))!)
            .filter(Boolean),
        add: async (name: string, targetType: TagTargetType, targetPath: string): Promise<Tag> => {
          const trimmed = name.trim().replace(/\s+/g, ' ');
          let tag = byName(trimmed);
          if (!tag) {
            tag = { id: nextId++, name: trimmed };
            tags.set(tag.id, tag);
          }
          links.add(`${tag.id}|${targetType}|${targetPath}`);
          return tag;
        },
        remove: async (tagId: number, targetType: TagTargetType, targetPath: string) => {
          links.delete(`${tagId}|${targetType}|${targetPath}`);
        },
        feedPage: async (tagId: number, cursor?: string) => {
          const paths = pathsForTag(tagId);
          const items = allItems.filter((i) =>
            [...paths].some((p) => i.path === p || i.path.startsWith(p + '/')),
          );
          return paginate(items, cursor);
        },
      };
    })(),
    scan: {
      start: async () => {},
      cancel: async () => {},
      onProgress: () => () => {},
    },
    win: {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
    },
    shell: {
      openPath: async () => {},
    },
  };

  window.roam = api;
  mockInstalled = true;
  console.info('[roam] API real não encontrada — usando mock de desenvolvimento (browser).');
  return api;
}

function svgPlaceholder(label: string, hue: number): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='1280'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},72%,38%)'/>` +
    `<stop offset='1' stop-color='hsl(${(hue + 70) % 360},72%,16%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='100%' height='100%' fill='url(#g)'/>` +
    `<circle cx='360' cy='560' r='120' fill='rgba(255,255,255,0.14)'/>` +
    `<text x='50%' y='52%' fill='rgba(255,255,255,0.92)' font-family='sans-serif' ` +
    `font-size='44' font-weight='700' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
