import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore, useFavorites } from '../../store';
import { getApi } from '../../api';
import { ProfileCard } from './ProfileCard';
import type { Profile, RootKind } from '../../shared/types';

const CARD_WIDTH = 240;
const GAP = 16;
const ROW_HEIGHT = 256; // cover(150) + info(~80) + gap buffer

interface MenuState {
  x: number;
  y: number;
  profile: Profile;
}

export function ProfileList() {
  const profiles = useStore((s) => s.profiles);
  const profileLoading = useStore((s) => s.profileLoading);
  const setProfiles = useStore((s) => s.setProfiles);
  const setProfileLoading = useStore((s) => s.setProfileLoading);
  const selectProfile = useStore((s) => s.selectProfile);
  const refreshFeed = useStore((s) => s.refreshFeed);
  const { favFolders, toggleFolder } = useFavorites();

  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStateRef = useRef<MenuState | null>(null);
  menuStateRef.current = menu;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, profile: Profile) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, profile });
    },
    [],
  );

  const handleToggleFavorite = useCallback(
    (profilePath: string) => {
      toggleFolder(profilePath);
    },
    [toggleFolder],
  );

  const handleProfileClick = useCallback(
    (profilePath: string) => {
      selectProfile(profilePath);
    },
    [selectProfile],
  );

  const refreshProfiles = async () => {
    const all = await getApi().library.list();
    setProfiles(all);
  };

  useEffect(() => {
    setProfileLoading(true);
    getApi().library
      .list()
      .then((p) => setProfiles(p))
      .catch(() => setProfileLoading(false));
  }, [setProfiles, setProfileLoading]);

  // fecha menu contextual ao clicar fora / ESC — listener permanente, lê estado via ref
  useEffect(() => {
    const onClose = (e: MouseEvent) => {
      if (!menuStateRef.current) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuStateRef.current) setMenu(null);
    };
    document.addEventListener('click', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handlePickFolder = async () => {
    const path = await getApi().library.pickFolder();
    if (path) setPendingPath(path);
  };

  const handleChooseKind = async (kind: RootKind) => {
    if (!pendingPath) return;
    setBusy(true);
    try {
      const all = await getApi().library.addRoot(pendingPath, kind);
      setProfiles(all);
      refreshFeed();
    } finally {
      setBusy(false);
      setPendingPath(null);
    }
  };

  const handleRemove = async (profile: Profile) => {
    setMenu(null);
    await getApi().library.removeRoot(profile.rootPath);
    await refreshProfiles();
    refreshFeed();
  };

  const handleRescan = async (profile: Profile) => {
    setMenu(null);
    await getApi().scan.start(profile.rootPath);
    await refreshProfiles();
    refreshFeed();
  };

  const handleOpenExplorer = (profile: Profile) => {
    setMenu(null);
    getApi().shell.openPath(profile.profilePath);
  };

  const handleUpdateKind = async (kind: RootKind) => {
    if (!editing) return;
    setBusy(true);
    try {
      const all = await getApi().library.updateRootKind(editing.rootPath, kind);
      setProfiles(all);
      refreshFeed();
    } finally {
      setBusy(false);
      setEditing(null);
    }
  };

  const listRef = useRef<HTMLDivElement>(null);

  // Calculate columns based on container width
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const columnsPerRow = Math.max(1, Math.floor((containerWidth - 40) / (CARD_WIDTH + GAP)));

  // Group profiles into rows + add "add-card" as last item
  const rows = useMemo(() => {
    const result: (Profile | null)[][] = [];
    const total = profiles.length + 1; // +1 for add-card
    let i = 0;
    while (i < total) {
      const row: (Profile | null)[] = [];
      for (let c = 0; c < columnsPerRow && i < total; c++, i++) {
        row.push(i <= profiles.length ? profiles[i - 1] : null);
      }
      result.push(row);
    }
    return result;
  }, [profiles, columnsPerRow]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (profileLoading) {
    return (
      <div className="loading-indicator">
        <div className="spinner" />
        <span>Carregando perfis...</span>
      </div>
    );
  }

  return (
    <div className="profile-list-wrap">
      <div
        ref={listRef}
        className="profile-list"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowProfiles = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 20,
                  right: 20,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                  display: 'flex',
                  gap: `${GAP}px`,
                  alignItems: 'flex-start',
                }}
              >
                {rowProfiles.map((profile, colIdx) => {
                  if (profile == null) {
                    // Add card
                    return (
                      <div
                        key={`add-${colIdx}`}
                        className="profile-card add-card"
                        style={{ width: `${CARD_WIDTH}px`, flexShrink: 0 }}
                        onClick={handlePickFolder}
                      >
                        <span className="add-icon">+</span>
                        <span className="add-label">Adicionar pasta</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={profile.profilePath}
                      style={{ width: `${CARD_WIDTH}px`, flexShrink: 0 }}
                      onContextMenu={(e) => handleContextMenu(e, profile)}
                    >
                      <ProfileCard
                        profile={profile}
                        isFavorite={favFolders.has(profile.profilePath)}
                        onToggleFavorite={handleToggleFavorite}
                        onClick={handleProfileClick}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              selectProfile(menu.profile.profilePath);
              setMenu(null);
            }}
          >
            Abrir perfil
          </button>
          <button onClick={() => handleOpenExplorer(menu.profile)}>
            Abrir no Explorador
          </button>
          <button onClick={() => handleRescan(menu.profile)}>Reindexar</button>
          <button
            onClick={() => {
              setEditing(menu.profile);
              setMenu(null);
            }}
          >
            Editar tipo de pasta…
          </button>
          <button className="danger" onClick={() => handleRemove(menu.profile)}>
            Remover da biblioteca
          </button>
        </div>
      )}

      {pendingPath && (
        <div className="modal-overlay" onClick={() => !busy && setPendingPath(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Como tratar esta pasta?</h3>
            <p className="modal-path" title={pendingPath}>{pendingPath}</p>
            {busy ? (
              <div className="loading-indicator" style={{ height: 120 }}>
                <div className="spinner" />
                <span>Indexando mídia...</span>
              </div>
            ) : (
              <div className="modal-options">
                <button className="modal-option" onClick={() => handleChooseKind('container')}>
                  <strong>Coleção de perfis</strong>
                  <span>Cada subpasta vira um perfil</span>
                </button>
                <button className="modal-option" onClick={() => handleChooseKind('profile')}>
                  <strong>Perfil único</strong>
                  <span>Esta pasta é um perfil; subpastas viram álbuns</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !busy && setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar tipo de pasta</h3>
            <p className="modal-path" title={editing.rootPath}>{editing.rootPath}</p>
            {busy ? (
              <div className="loading-indicator" style={{ height: 120 }}>
                <div className="spinner" />
                <span>Reindexando...</span>
              </div>
            ) : (
              <div className="modal-options">
                <button
                  className={`modal-option ${editing.rootKind === 'container' ? 'selected' : ''}`}
                  onClick={() => handleUpdateKind('container')}
                >
                  <strong>Coleção de perfis</strong>
                  <span>Cada subpasta vira um perfil</span>
                </button>
                <button
                  className={`modal-option ${editing.rootKind === 'profile' ? 'selected' : ''}`}
                  onClick={() => handleUpdateKind('profile')}
                >
                  <strong>Perfil único</strong>
                  <span>Esta pasta é um perfil; subpastas viram álbuns</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
