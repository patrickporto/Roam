import { useState } from 'react';
import type { AlbumSummary } from '../../shared/types';
import { useItemTags } from '../../store';
import { TagPopover } from '../TagPopover';

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
  const [taggingAlbum, setTaggingAlbum] = useState<string | null>(null);

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
                <AlbumTagButton
                  path={album.path}
                  open={taggingAlbum === album.path}
                  onToggle={() =>
                    setTaggingAlbum((cur) => (cur === album.path ? null : album.path))
                  }
                  onClose={() => setTaggingAlbum(null)}
                />
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

function AlbumTagButton({
  path,
  open,
  onToggle,
  onClose,
}: {
  path: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const tags = useItemTags('folder', path);
  return (
    <>
      <button
        className={`fav-btn ${tags.length > 0 ? 'tagged' : ''}`}
        title="Tags"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={tags.length > 0 ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      </button>
      {open && <TagPopover targetType="folder" targetPath={path} onClose={onClose} />}
    </>
  );
}
