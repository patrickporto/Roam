import { useEffect, useMemo, useState } from 'react';
import { useStore, useFavorites } from '../store';
import { getApi } from '../api';
import { MediaGrid } from './feed/MediaGrid';
import { FeedView } from './feed/FeedView';
import type { MediaItem } from '../shared/types';

type TypeFilter = 'all' | 'image' | 'video';
type FavSort = 'recent' | 'oldest' | 'name';

function HeartIcon({ filled = true, size = 22 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function FavoritesPage() {
  const profiles = useStore((s) => s.profiles);
  const profileMap = useStore((s) => s.profileMap);
  const selectProfile = useStore((s) => s.selectProfile);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const { favFolders, toggleFile } = useFavorites();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'grid' | 'feed'>('grid');
  const [startItem, setStartItem] = useState<MediaItem | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<FavSort>('recent');

  const loadMore = async (cur?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const page = await getApi().favorites.media(cur);
      setItems((prev) => (cur ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let photos = 0;
    let videos = 0;
    for (const item of items) {
      if (item.type === 'image') photos++;
      else videos++;
    }
    return { photos, videos };
  }, [items]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (typeFilter !== 'all') {
      list = list.filter((item) => item.type === typeFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.includes(q)),
      );
    }
    if (sort === 'oldest') {
      list = [...list].sort((a, b) => a.modifiedAt - b.modifiedAt);
    } else if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [items, typeFilter, query, sort]);

  const bannerUrl = useMemo(
    () => items.find((item) => item.type === 'image')?.mediaUrl ?? null,
    [items],
  );

  const unfavorite = async (item: MediaItem) => {
    setItems((prev) => prev.filter((i) => i.path !== item.path));
    await toggleFile(item.path);
  };

  if (mode === 'feed') {
    return (
      <div className="feed-full">
        <button className="back-btn float" onClick={() => setMode('grid')}>
          ←
        </button>
        <FeedView scope="profile" items={items} initialItem={startItem} />
      </div>
    );
  }

  const knownProfiles = new Set(profiles.map((p) => p.profilePath));

  return (
    <div className="favorites-page">
      <div className="fav-hero">
        {bannerUrl && (
          <div
            className="profile-banner"
            style={{ backgroundImage: `url("${bannerUrl}")` }}
          />
        )}
        <div className="fav-hero-row">
          <div className="fav-hero-icon">
            <HeartIcon size={28} />
          </div>
          <div className="profile-id">
            <span className="profile-username">Favoritos</span>
            <span className="profile-stats">
              {items.length} {items.length === 1 ? 'arquivo curtido' : 'arquivos curtidos'}
              {stats.photos > 0 && ` · ${stats.photos} ${stats.photos === 1 ? 'foto' : 'fotos'}`}
              {stats.videos > 0 && ` · ${stats.videos} ${stats.videos === 1 ? 'vídeo' : 'vídeos'}`}
            </span>
          </div>
        </div>
      </div>

      {favFolders.size > 0 && (
        <>
          <div className="section-title">Pastas favoritas</div>
          <div className="fav-folders-rail">
            {[...favFolders].map((f) => {
              const name = f.split(/[\\/]/).pop() || f;
              const navigable = knownProfiles.has(f);
              const cover = profileMap.get(f)?.coverUrl ?? null;
              return (
                <button
                  key={f}
                  className={`fav-folder-card ${navigable ? '' : 'disabled'}`}
                  title={f}
                  onClick={() => navigable && selectProfile(f)}
                >
                  <div className="cover">
                    {cover ? (
                      <img src={cover} alt={name} loading="lazy" decoding="async" />
                    ) : (
                      <span className="cover-placeholder">📁</span>
                    )}
                  </div>
                  <span className="name">{name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="fav-toolbar">
        <input
          className="profile-search"
          placeholder="Buscar nos favoritos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="fav-filter-chips">
          {(
            [
              ['all', 'Todos'],
              ['image', 'Fotos'],
              ['video', 'Vídeos'],
            ] as [TypeFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={`fav-filter-chip ${typeFilter === value ? 'active' : ''}`}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="profile-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as FavSort)}
        >
          <option value="recent">Recentes</option>
          <option value="oldest">Antigas</option>
          <option value="name">Nome</option>
        </select>
      </div>

      {items.length === 0 && !loading ? (
        <div className="profile-empty fav-empty">
          <div className="fav-empty-icon">
            <HeartIcon filled={false} size={44} />
          </div>
          <p>Nenhum arquivo curtido ainda.</p>
          <p className="fav-empty-hint">
            Use o coração no feed ou double-click para curtir.
          </p>
          <button className="cta" onClick={() => setActiveTab('for-you')}>
            Explorar feed
          </button>
        </div>
      ) : visibleItems.length === 0 && !loading ? (
        <div className="profile-empty">
          <p>Nenhum resultado para esse filtro.</p>
        </div>
      ) : (
        <div className="profile-grid-wrap">
          <MediaGrid
            items={visibleItems}
            loading={loading}
            onSelect={(item) => {
              setStartItem(item);
              setMode('feed');
            }}
            onReachEnd={() => cursor && loadMore(cursor)}
            onUnfavorite={unfavorite}
          />
        </div>
      )}
    </div>
  );
}
