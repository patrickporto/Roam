import React from 'react';
import type { Profile } from '../../shared/types';

interface ProfileCardProps {
  profile: Profile;
  isFavorite: boolean;
  onToggleFavorite: (profilePath: string) => void;
  onClick: (profilePath: string) => void;
}

function ProfileCardInner({
  profile,
  isFavorite,
  onToggleFavorite,
  onClick,
}: ProfileCardProps) {
  const handleClick = React.useCallback(
    () => onClick(profile.profilePath),
    [profile.profilePath, onClick],
  );

  const handleToggleFavorite = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(profile.profilePath);
    },
    [profile.profilePath, onToggleFavorite],
  );

  return (
    <div className="profile-card" onClick={handleClick}>
      <div className="cover">
        {profile.coverUrl ? (
          <img src={profile.coverUrl} alt={profile.username} loading="lazy" decoding="async" fetchPriority="low" />
        ) : (
          <span className="cover-placeholder">
            {profile.username.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="info">
        <div className="username">
          {profile.username}
          <button
            className={`fav-btn ${isFavorite ? 'favorited' : ''}`}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Desfavoritar perfil' : 'Favoritar perfil'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
        <div className="stats">
          {profile.mediaCount} mídias
          {profile.albums.length > 0 && <> · {profile.albums.length} álbuns</>}
        </div>
      </div>
    </div>
  );
}

export const ProfileCard = React.memo(ProfileCardInner);
