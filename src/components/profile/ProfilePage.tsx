import { useEffect, useState } from 'react';
import { useStore, useFavorites, useProfileMedia } from '../../store';
import { getApi } from '../../api';
import { FeedView } from '../feed/FeedView';
import { MediaGrid } from '../feed/MediaGrid';
import { AlbumGrid } from './AlbumGrid';
import type { MediaItem, SortOrder } from '../../shared/types';

interface ProfilePageProps {
  profilePath: string;
}

export function ProfilePage({ profilePath }: ProfilePageProps) {
  const selectProfile = useStore((s) => s.selectProfile);
  const profile = useStore((s) => s.selectedProfile);
  const profiles = useStore((s) => s.profiles);
  const setProfiles = useStore((s) => s.setProfiles);
  const [viewAlbum, setViewAlbum] = useState<string | null>(null);
  const [mode, setMode] = useState<'grid' | 'feed'>('grid');
  const [viewMode, setViewMode] = useState<'root' | 'albums'>('root');
  const [order, setOrder] = useState<SortOrder>('recommended');
  const [startItem, setStartItem] = useState<MediaItem | null>(null);

  const { profileMedia, loadNextPage, loading } = useProfileMedia(
    viewAlbum ? null : profilePath,
    viewAlbum,
    order,
  );

  // Fallback: perfil não estava na lista carregada
  useEffect(() => {
    if (!profile) {
      getApi().library.getProfile(profilePath).then((p) => {
        if (p) {
          // Add to profiles list if not already present
          if (!profiles.some((x) => x.profilePath === p.profilePath)) {
            setProfiles([...profiles, p]);
          }
          // CRITICAL FIX: Also set selectedProfile so the spinner goes away
          useStore.getState().selectProfile(p.profilePath);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilePath, profile]);

  const { favFolders, toggleFolder } = useFavorites();

  if (!profile) {
    return (
      <div className="loading-indicator">
        <div className="spinner" />
      </div>
    );
  }

  // ── Modo feed imersivo ──
  if (mode === 'feed') {
    // Mostra todas as mídias do perfil (mesma lógica da grade)
    const feedMedia = viewAlbum
      ? profileMedia
      : profileMedia;
    return (
      <div className="feed-full">
        <button className="back-btn float" onClick={() => setMode('grid')}>
          ←
        </button>
        <FeedView
          scope="profile"
          items={feedMedia}
          loadNext={loadNextPage}
          initialItem={startItem}
        />
      </div>
    );
  }

// ── Modo grade (padrão, estilo perfil do TikTok) ──
  const currentTarget = viewAlbum ?? profilePath;
  const isFav = favFolders.has(currentTarget);

  // Quando vendo álbum específico: mostra só mídias daquele álbum
  // Quando vendo perfil (aba Mídia): mostra todas as mídias do perfil
  const rootMedia = viewAlbum
    ? profileMedia
    : profileMedia;

  return (
    <div className="profile-page">
      <div className="profile-header">
        {profile.coverUrl && (
          <div
            className="profile-banner"
            style={{ backgroundImage: `url("${profile.coverUrl}")` }}
          />
        )}
        <div className="profile-header-row">
          <button
            className="back-btn"
            onClick={() => {
              if (viewAlbum) setViewAlbum(null);
              else selectProfile(null);
            }}
          >
            ←
          </button>
          <div className="profile-avatar">
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="profile-id">
            <span className="profile-username">
              {viewAlbum
                ? `${profile.username} / ${viewAlbum.split(/[\\/]/).pop()}`
                : `@${profile.username}`}
            </span>
            <span className="profile-stats">
              {profile.mediaCount} mídias
              {profile.albums.length > 0 && ` · ${profile.albums.length} álbuns`}
            </span>
          </div>
          <select
            className="sort-select"
            value={order}
            onChange={(e) => setOrder(e.target.value as SortOrder)}
          >
            <option value="recommended">Recomendadas</option>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
          <button
            className={`fav-btn big ${isFav ? 'favorited' : ''}`}
            onClick={() => toggleFolder(currentTarget)}
            title={isFav ? 'Remover dos favoritos' : 'Favoritar'}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={isFav ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Tabs (só no perfil, não em álbum) ── */}
      {!viewAlbum && (
        <div className="profile-tabs">
          <button
            className={`profile-tab ${viewMode === 'root' ? 'active' : ''}`}
            onClick={() => setViewMode('root')}
          >
            Mídia
          </button>
          <button
            className={`profile-tab ${viewMode === 'albums' ? 'active' : ''}`}
            onClick={() => setViewMode('albums')}
          >
            Álbuns
          </button>
        </div>
      )}

      {/* ── Conteúdo das tabs ── */}
      {!viewAlbum && viewMode === 'albums' && profile.albums.length > 0 && (
        <AlbumGrid
          albums={profile.albums}
          favFolders={favFolders}
          onToggleFavorite={toggleFolder}
          onSelectAlbum={setViewAlbum}
        />
      )}

      {/* ── Mídia no perfil (raiz ou álbum) ── */}
      {(!viewAlbum && viewMode === 'root') && (
        <div className="profile-grid-wrap">
          {rootMedia.length === 0 && !loading ? (
            <div className="profile-empty">
              <p>Nenhuma mídia encontrada aqui.</p>
            </div>
          ) : (
            <MediaGrid
              items={rootMedia}
              loading={loading}
              onSelect={(item) => {
                setStartItem(item);
                setMode('feed');
              }}
              onReachEnd={() => loadNextPage()}
            />
          )}
        </div>
      )}

      {/* ── Mídia do álbum (quando vendo álbum específico) ── */}
      {viewAlbum && (
        <div className="profile-grid-wrap">
          {rootMedia.length === 0 && !loading ? (
            <div className="profile-empty">
              <p>Nenhuma mídia neste álbum.</p>
            </div>
          ) : (
            <MediaGrid
              items={rootMedia}
              loading={loading}
              onSelect={(item) => {
                setStartItem(item);
                setMode('feed');
              }}
              onReachEnd={() => loadNextPage()}
            />
          )}
        </div>
      )}
    </div>
  );
}
