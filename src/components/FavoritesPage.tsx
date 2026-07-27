import { useEffect, useState } from 'react';
import { useStore, useFavorites } from '../store';
import { getApi } from '../api';
import { MediaGrid } from './feed/MediaGrid';
import { FeedView } from './feed/FeedView';
import type { MediaItem } from '../shared/types';

export function FavoritesPage() {
  const profiles = useStore((s) => s.profiles);
  const selectProfile = useStore((s) => s.selectProfile);
  const { favFolders } = useFavorites();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'grid' | 'feed'>('grid');
  const [startItem, setStartItem] = useState<MediaItem | null>(null);

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
      <div className="favorites-header">
        <h2>Favoritos</h2>
        <span className="profile-stats">{items.length} arquivos curtidos</span>
      </div>

      {favFolders.size > 0 && (
        <>
          <div className="section-title">Pastas favoritas</div>
          <div className="fav-folders">
            {[...favFolders].map((f) => {
              const name = f.split(/[\\/]/).pop() || f;
              const navigable = knownProfiles.has(f);
              return (
                <button
                  key={f}
                  className={`fav-folder-chip ${navigable ? '' : 'disabled'}`}
                  title={f}
                  onClick={() => navigable && selectProfile(f)}
                >
                  📁 {name}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">Arquivos curtidos</div>
      {items.length === 0 && !loading ? (
        <div className="profile-empty">
          <p>Nenhum arquivo curtido ainda.</p>
          <p style={{ fontSize: 13, color: '#666' }}>
            Use o coração no feed ou double-click para curtir.
          </p>
        </div>
      ) : (
        <MediaGrid
          items={items}
          onSelect={(item) => {
            setStartItem(item);
            setMode('feed');
          }}
          onReachEnd={() => cursor && loadMore(cursor)}
        />
      )}
      {loading && (
        <div className="loading-indicator" style={{ height: 80 }}>
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
