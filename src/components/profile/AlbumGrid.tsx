import type { AlbumSummary } from '../../shared/types';

interface AlbumGridProps {
  albums: AlbumSummary[];
  favFolders: Set<string>;
  onToggleFavorite: (path: string) => void;
  onSelectAlbum: (path: string) => void;
}

export function AlbumGrid({
  albums,
  favFolders,
  onToggleFavorite,
  onSelectAlbum,
}: AlbumGridProps) {
  if (albums.length === 0) return null;

  return (
    <div className="album-grid">
      {albums.map((album) => {
        const isFav = favFolders.has(album.path);
        return (
          <div
            key={album.path}
            className="album-card"
            onClick={() => onSelectAlbum(album.path)}
          >
            <div className="cover">
              {album.coverUrl ? (
                <img src={album.coverUrl} alt={album.name} />
              ) : (
                <span className="cover-placeholder">📁</span>
              )}
            </div>
            <div className="info">
              <div className="name">
                {album.name}
                <button
                  className={`fav-btn ${isFav ? 'favorited' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(album.path);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill={isFav ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>
              <div className="count">{album.mediaCount} mídias</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
