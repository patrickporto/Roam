import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { Profile, FeedPage, MediaItem, SortOrder, Tag, TagSummary, TagTargetType } from '../shared/types';
import { getApi } from '../api';

// ── Store ────────────────────────────────────────────────────────────────────

interface AppState {
  activeTab: 'for-you' | 'library' | 'favorites' | 'tags';
  setActiveTab: (tab: 'for-you' | 'library' | 'favorites' | 'tags') => void;

  // Feed (janela deslizante para escala: feedTrimOffset conta itens descartados)
  feedItems: MediaItem[];
  feedCursor: string | null | undefined;
  feedTrimOffset: number;
  feedLoading: boolean;
  appendFeedPage: (page: FeedPage) => void;
  clearFeed: () => void;
  refreshFeed: () => void;
  setFeedLoading: (v: boolean) => void;

  // Library
  profiles: Profile[];
  profileMap: Map<string, Profile>;
  profileLoading: boolean;
  setProfiles: (p: Profile[]) => void;
  setProfileLoading: (v: boolean) => void;

  // Favorited file paths (for star icons)
  favFiles: Set<string>;
  favFolders: Set<string>;
  setFav: (files: string[], folders: string[]) => void;
  toggleFavFile: (path: string, newState: boolean) => void;
  toggleFavFolder: (path: string, newState: boolean) => void;

  // Tags
  allTags: TagSummary[];
  setAllTags: (tags: TagSummary[]) => void;
  /** Cache de tags por alvo, chave `${targetType}:${targetPath}`. */
  itemTags: Map<string, Tag[]>;
  setItemTags: (key: string, tags: Tag[]) => void;
  /** Tag selecionada para o feed por tag (aba Tags). */
  selectedTagId: number | null;
  selectTag: (id: number | null) => void;

  // Detail view (profile)
  selectedProfile: Profile | null;
  selectedRoot: string | null;
  selectProfile: (rootPath: string | null) => void;
  profileMedia: MediaItem[];
  profileCursor: string | null | undefined;
  appendProfileMedia: (page: FeedPage) => void;
  clearProfileMedia: () => void;
}

export const useStore = create<AppState>((set) => ({
  activeTab: 'for-you',
  setActiveTab: (tab) => set({ activeTab: tab }),

  feedItems: [],
  feedCursor: undefined as string | null | undefined,
  feedTrimOffset: 0,
  feedLoading: false,
  appendFeedPage: (page) =>
    set((s) => {
      const MAX = 500;
      let feedItems = [...s.feedItems, ...page.items];
      let feedTrimOffset = s.feedTrimOffset;
      if (feedItems.length > MAX) {
        const drop = feedItems.length - MAX;
        feedItems = feedItems.slice(drop);
        feedTrimOffset += drop;
      }
      return {
        feedItems,
        feedTrimOffset,
        feedCursor: page.nextCursor,
        feedLoading: false,
      };
    }),
  clearFeed: () =>
    set({ feedItems: [], feedCursor: undefined, feedTrimOffset: 0, feedLoading: false }),
  refreshFeed: () => {
    getApi().feed.resetSession().catch(() => {});
    set({ feedItems: [], feedCursor: undefined, feedTrimOffset: 0, feedLoading: false });
  },
  setFeedLoading: (v) => set({ feedLoading: v }),

  profiles: [],
  profileMap: new Map(),
  profileLoading: false,
  setProfiles: (p) => set({ profiles: p, profileMap: new Map(p.map((profile) => [profile.profilePath, profile])), profileLoading: false }),
  setProfileLoading: (v) => set({ profileLoading: v }),

  favFiles: new Set(),
  favFolders: new Set(),
  setFav: (files, folders) =>
    set({ favFiles: new Set(files), favFolders: new Set(folders) }),
  toggleFavFile: (path, newState) =>
    set((s) => {
      const next = new Set(s.favFiles);
      if (newState) next.add(path);
      else next.delete(path);
      return { favFiles: next };
    }),
  toggleFavFolder: (path, newState) =>
    set((s) => {
      const next = new Set(s.favFolders);
      if (newState) next.add(path);
      else next.delete(path);
      return { favFolders: next };
    }),

  allTags: [],
  setAllTags: (tags) => set({ allTags: tags }),
  itemTags: new Map(),
  setItemTags: (key, tags) =>
    set((s) => {
      const next = new Map(s.itemTags);
      next.set(key, tags);
      return { itemTags: next };
    }),
  selectedTagId: null,
  selectTag: (id) =>
    set({ selectedTagId: id, selectedRoot: null, selectedProfile: null }),

  selectedProfile: null,
  selectedRoot: null,
  selectProfile: (profilePath) =>
    set({
      selectedRoot: profilePath,
      selectedProfile: profilePath
        ? useStore.getState().profileMap.get(profilePath) ?? null
        : null,
      profileMedia: [],
      profileCursor: undefined,
    }),
  profileMedia: [],
  profileCursor: undefined,
  appendProfileMedia: (page) =>
    set((s) => ({
      profileMedia: [...s.profileMedia, ...page.items],
      profileCursor: page.nextCursor,
    })),
  clearProfileMedia: () => set({ profileMedia: [], profileCursor: undefined }),
}));

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useFeed() {
  const feedItems = useStore((s) => s.feedItems);
  const feedCursor = useStore((s) => s.feedCursor);
  const feedLoading = useStore((s) => s.feedLoading);
  const appendFeedPage = useStore((s) => s.appendFeedPage);
  const setFeedLoading = useStore((s) => s.setFeedLoading);

  const loadNextPage = useCallback(async () => {
    if (feedCursor === null || feedLoading) return;
    setFeedLoading(true);
    try {
      const page = await getApi().feed.forYou(feedCursor ?? undefined);
      appendFeedPage(page);
    } catch (e) {
      console.error('Failed to load feed page', e);
      setFeedLoading(false);
    }
  }, [feedCursor, feedLoading, appendFeedPage, setFeedLoading]);

  useEffect(() => {
    if (feedCursor === undefined && !feedLoading) {
      loadNextPage();
    }
  }, [feedCursor, feedLoading, loadNextPage]);

  return { feedItems, loadNextPage, feedLoading };
}

/** Selector: returns true if a specific folder is favorited (stable reference). */
export function useIsFavFolder(path: string): boolean {
  return useStore((s) => s.favFolders.has(path));
}

/** Selector: returns true if a specific file is favorited (stable reference). */
export function useIsFavFile(path: string): boolean {
  return useStore((s) => s.favFiles.has(path));
}

export function useFavorites() {

  const favFiles = useStore((s) => s.favFiles);
  const favFolders = useStore((s) => s.favFolders);
  const [loading, setLoading] = useState(false);
  const setFav = useStore((s) => s.setFav);
  const toggleFavFile = useStore((s) => s.toggleFavFile);
  const toggleFavFolder = useStore((s) => s.toggleFavFolder);

  useEffect(() => {
    setLoading(true);
    getApi().favorites
      .list()
      .then((snap) => {
        setFav(snap.files, snap.folders);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [setFav]);

  const toggleFile = useCallback(
    async (path: string) => {
      const newState = await getApi().favorites.toggle('file', path);
      toggleFavFile(path, newState);
    },
    [toggleFavFile],
  );

  const toggleFolder = useCallback(
    async (path: string) => {
      const newState = await getApi().favorites.toggle('folder', path);
      toggleFavFolder(path, newState);
    },
    [toggleFavFolder],
  );

  return { favFiles, favFolders, toggleFile, toggleFolder, loading };
}

// ── Tags ─────────────────────────────────────────────────────────────────────

function tagKey(targetType: TagTargetType, targetPath: string): string {
  return `${targetType}:${targetPath}`;
}

function refreshAllTags(): void {
  getApi()
    .tags.list()
    .then((tags) => useStore.getState().setAllTags(tags))
    .catch(() => {});
}

/** Lista global de tags com contagem; carrega uma vez e invalida via refreshAllTags nas mutações. */
export function useAllTags(): TagSummary[] {
  const allTags = useStore((s) => s.allTags);
  useEffect(() => {
    if (useStore.getState().allTags.length === 0) refreshAllTags();
  }, []);
  return allTags;
}

/** Tags aplicadas a um alvo; busca sob demanda e cacheia no store. */
export function useItemTags(
  targetType: TagTargetType,
  targetPath: string,
  enabled = true,
): Tag[] {
  const key = tagKey(targetType, targetPath);
  const cached = useStore((s) => s.itemTags.get(key));

  useEffect(() => {
    if (!enabled || cached !== undefined) return;
    getApi()
      .tags.forItem(targetType, targetPath)
      .then((tags) => useStore.getState().setItemTags(key, tags))
      .catch(() => {});
  }, [key, enabled, cached]);

  return cached ?? [];
}

/** Aplica tag com atualização otimista; reconcilia com a resposta do main. */
export async function applyTag(
  name: string,
  targetType: TagTargetType,
  targetPath: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const key = tagKey(targetType, targetPath);
  const state = useStore.getState();
  const current = state.itemTags.get(key) ?? [];

  const existing = state.allTags.find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const optimistic: Tag = existing ?? { id: -Date.now(), name: trimmed };
  if (!current.some((t) => t.id === optimistic.id)) {
    state.setItemTags(key, [...current, optimistic]);
  }

  try {
    const tag = await getApi().tags.add(trimmed, targetType, targetPath);
    if (tag) {
      const latest = useStore.getState().itemTags.get(key) ?? [];
      useStore.getState().setItemTags(key, [
        ...latest.filter((t) => t.id !== optimistic.id && t.id !== tag.id),
        tag,
      ]);
      refreshAllTags();
    }
  } catch {
    // rollback otimista
    const latest = useStore.getState().itemTags.get(key) ?? [];
    useStore.getState().setItemTags(key, latest.filter((t) => t.id !== optimistic.id));
  }
}

/** Remove tag do alvo com atualização otimista. */
export async function unapplyTag(
  tagId: number,
  targetType: TagTargetType,
  targetPath: string,
): Promise<void> {
  const key = tagKey(targetType, targetPath);
  const state = useStore.getState();
  const current = state.itemTags.get(key) ?? [];
  state.setItemTags(key, current.filter((t) => t.id !== tagId));

  try {
    await getApi().tags.remove(tagId, targetType, targetPath);
    refreshAllTags();
  } catch {
    useStore.getState().setItemTags(key, current);
  }
}

export function useProfileMedia(
  profilePath: string | null,
  albumPath: string | null,
  order: SortOrder = 'recent',
) {
  const profileMedia = useStore((s) => s.profileMedia);
  const profileCursor = useStore((s) => s.profileCursor);
  const appendProfileMedia = useStore((s) => s.appendProfileMedia);
  const [loading, setLoading] = useState(false);
  // Época invalida respostas em voo quando o escopo muda (ou desmonta):
  // sem isso, uma resposta atrasada do escopo anterior sobrescreve o cursor
  // e a paginação do novo escopo pula itens.
  const epochRef = useRef(0);
  const fetchingRef = useRef(false);

  const loadNextPage = useCallback(async () => {
    if (!profilePath && !albumPath) return;
    if (profileCursor === null || loading || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    const epoch = epochRef.current;
    try {
      const scope = { profilePath: profilePath ?? undefined, albumPath: albumPath ?? undefined };
      const page = await getApi().library.listMedia(scope, profileCursor ?? undefined, order);
      if (epoch !== epochRef.current) return; // escopo mudou durante o fetch
      appendProfileMedia(page);
    } catch (e) {
      console.error('[useProfileMedia] Failed to load profile media', e);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [profilePath, albumPath, order, profileCursor, loading, appendProfileMedia]);

  useEffect(() => {
    // reset on scope/order change
    epochRef.current++;
    useStore.getState().clearProfileMedia();
  }, [profilePath, albumPath, order]);

  useEffect(() => () => {
    epochRef.current++;
  }, []);

  useEffect(() => {
    if (profileMedia.length === 0 && !loading) {
      loadNextPage();
    }
  }, [profileMedia.length, loading, loadNextPage]);

  return { profileMedia, loadNextPage, loading };
}
