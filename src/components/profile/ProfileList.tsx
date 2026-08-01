import { memo, useCallback, useEffect, useState, useRef, useMemo } from 'react';
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

type ProfileSort = 'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc';

const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

interface ProfileRowProps {
  rowProfiles: (Profile | null)[];
  start: number;
  favFolders: Set<string>;
  onContextMenu: (e: React.MouseEvent, profile: Profile) => void;
  onToggleFavorite: (profilePath: string) => void;
  onProfileClick: (profilePath: string) => void;
  onPickFolder: () => void;
}

const ProfileRow = memo(function ProfileRow({
  rowProfiles,
  start,
  favFolders,
  onContextMenu,
  onToggleFavorite,
  onProfileClick,
  onPickFolder,
}: ProfileRowProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        transform: `translateY(${start}px)`,
        height: ROW_HEIGHT,
        display: 'flex',
        gap: GAP,
        alignItems: 'flex-start',
      }}
    >
      {rowProfiles.map((profile) => {
        if (profile == null) {
          return (
            <div
              key="add-card"
              className="profile-card add-card"
              style={{ width: CARD_WIDTH, flexShrink: 0 }}
              onClick={onPickFolder}
            >
              <span className="add-icon">+</span>
              <span className="add-label">Adicionar pasta</span>
            </div>
          );
        }
        return (
          <div
            key={profile.profilePath}
            style={{ width: CARD_WIDTH, flexShrink: 0 }}
            onContextMenu={(e) => onContextMenu(e, profile)}
          >
            <ProfileCard
              profile={profile}
              isFavorite={favFolders.has(profile.profilePath)}
              onToggleFavorite={onToggleFavorite}
              onClick={onProfileClick}
            />
          </div>
        );
      })}
    </div>
  );
});

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProfileSort>('name-asc');
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

  const handlePickFolder = useCallback(async () => {
    const path = await getApi().library.pickFolder();
    if (path) setPendingPath(path);
  }, []);

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

  // Recalcula colunas apenas quando o número muda (evita re-chunk a cada pixel de resize)
  const [columnsPerRow, setColumnsPerRow] = useState(1);

  // Depende de profileLoading: a lista desmonta durante o loading e remonta
  // como novo nó — o observer precisa ser reanexado ao elemento novo.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    let raf = 0;
    const update = (width: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cols = Math.max(1, Math.floor((width - 40) / (CARD_WIDTH + GAP)));
        setColumnsPerRow((prev) => (prev === cols ? prev : cols));
      });
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) update(entry.contentRect.width);
    });
    observer.observe(el);
    update(el.clientWidth);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [profileLoading]);

  // Filtra por nome e ordena conforme seleção (padrão: alfabética A–Z)
  const visibleProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? profiles.filter((p) => p.username.toLowerCase().includes(q))
      : profiles;
    const sorted = [...filtered];
    switch (sort) {
      case 'name-asc':
        sorted.sort((a, b) => nameCollator.compare(a.username, b.username));
        break;
      case 'name-desc':
        sorted.sort((a, b) => nameCollator.compare(b.username, a.username));
        break;
      case 'modified-desc':
        sorted.sort((a, b) => b.modifiedAt - a.modifiedAt);
        break;
      case 'modified-asc':
        sorted.sort((a, b) => a.modifiedAt - b.modifiedAt);
        break;
    }
    return sorted;
  }, [profiles, query, sort]);

  // Group profiles into rows + add "add-card" as last item
  const rows = useMemo(() => {
    const result: (Profile | null)[][] = [];
    const total = visibleProfiles.length + 1; // +1 for add-card
    let i = 0;
    while (i < total) {
      const row: (Profile | null)[] = [];
      for (let c = 0; c < columnsPerRow && i < total; c++, i++) {
        row.push(i <= visibleProfiles.length ? visibleProfiles[i - 1] : null);
      }
      result.push(row);
    }
    return result;
  }, [visibleProfiles, columnsPerRow]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
  });

  // Volta ao topo ao mudar busca/ordenação
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query, sort]);

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
      <div className="profile-toolbar">
        <input
          type="search"
          className="profile-search"
          placeholder="Buscar perfil..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="profile-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as ProfileSort)}
        >
          <option value="name-asc">Nome (A–Z)</option>
          <option value="name-desc">Nome (Z–A)</option>
          <option value="modified-desc">Modificação (mais recente)</option>
          <option value="modified-asc">Modificação (mais antiga)</option>
        </select>
      </div>
      <div
        ref={listRef}
        className="profile-list"
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
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
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <ProfileRow
              key={virtualRow.key}
              rowProfiles={rows[virtualRow.index]}
              start={virtualRow.start}
              favFolders={favFolders}
              onContextMenu={handleContextMenu}
              onToggleFavorite={handleToggleFavorite}
              onProfileClick={handleProfileClick}
              onPickFolder={handlePickFolder}
            />
          ))}
        </div>
        {visibleProfiles.length === 0 && (
          <div className="empty-state">
            <span>Nenhum perfil encontrado para "{query.trim()}".</span>
          </div>
        )}
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
