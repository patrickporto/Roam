import { useEffect, useRef, useCallback, useState } from 'react';
import { useFeed, useFavorites, useStore } from '../../store';
import { MediaCard } from './MediaCard';
import type { MediaItem } from '../../shared/types';

interface FeedViewProps {
  scope: 'forYou' | 'profile';
  items?: MediaItem[];
  loadNext?: () => Promise<void>;
  /** Item inicial (navegação a partir de grade). */
  initialItem?: MediaItem | null;
}

/** Raio da janela de renderização do DOM ao redor do item ativo. */
const RENDER_RADIUS = 2;

export function FeedView({
  scope,
  items: externalItems,
  loadNext: externalLoad,
  initialItem = null,
}: FeedViewProps) {
  const { feedItems, loadNextPage: loadForYou, feedLoading } = useFeed();
  const feedTrimOffset = useStore((s) => s.feedTrimOffset);
  const { favFiles, favFolders, toggleFile, toggleFolder } = useFavorites();
  const setActiveTab = useStore((s) => s.setActiveTab);
  const activeTab = useStore((s) => s.activeTab);
  const refreshFeed = useStore((s) => s.refreshFeed);

  const containerRef = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef(false);
  const didInitRef = useRef(false);
  const initItemRef = useRef<string | null>(null);
  const prevTrimRef = useRef(0);
  const isScrollingRef = useRef(false);
  const scrollEndTimer = useRef<number | undefined>(undefined);

  const [activeIdx, setActiveIdx] = useState(0); // índice absoluto (inclui trimOffset)
  const activeIdxRef = useRef(0);
  const [vh, setVh] = useState(() => window.innerHeight);

  const isForYou = scope === 'forYou';
  const trimOffset = isForYou ? feedTrimOffset : 0;
  const items: MediaItem[] = isForYou ? feedItems : (externalItems ?? []);
  const loading = isForYou ? feedLoading : false;
  const totalVirtual = trimOffset + items.length; // altura virtual total em itens

  const loadNext = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (isForYou) await loadForYou();
      else if (externalLoad) await externalLoad();
    } finally {
      fetchingRef.current = false;
    }
  }, [isForYou, loadForYou, externalLoad]);

  // Auto-refresh feed when entering the "For You" tab
  useEffect(() => {
    if (isForYou && activeTab === 'for-you') {
      refreshFeed();
    }
  }, [isForYou, activeTab, refreshFeed]);

  // altura do viewport observável
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (el && el.clientHeight > 0) setVh(el.clientHeight);
    };
    // Defer measurement to after paint to avoid reading 0 on mount
    const raf = requestAnimationFrame(() => {
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // salto inicial (navegação a partir de grade)
  useEffect(() => {
    if (items.length === 0) return;
    const el = containerRef.current;
    if (!el) return;

    const currentInit = initialItem?.path ?? null;
    if (initItemRef.current === currentInit && didInitRef.current) return;

    const realVh = el.clientHeight > 0 ? el.clientHeight : vh;
    if (realVh === 0) return; // esperar layout pronto

    initItemRef.current = currentInit;
    didInitRef.current = true;

    // Defer index calc + scroll to next frame so trimOffset/items are stable
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const vhNow = container.clientHeight > 0 ? container.clientHeight : vh;
      if (vhNow === 0) return;

      const total = trimOffset + items.length;
      let idx = 0;
      if (initialItem) {
        idx = items.findIndex((m) => m.path === initialItem.path);
        if (idx < 0) idx = 0;
      }
      idx = Math.min(idx, Math.max(0, total - 1));

      activeIdxRef.current = idx;
      setActiveIdx(idx);
      container.scrollTop = idx * vhNow;
    });
  }, [items.length > 0, vh, initialItem, trimOffset]);

  // compensação de scroll quando a janela deslizante descarta itens antigos
  useEffect(() => {
    const delta = trimOffset - prevTrimRef.current;
    if (delta !== 0) {
      const el = containerRef.current;
      if (el) el.scrollTop -= delta * vh;
      activeIdxRef.current -= delta;
      setActiveIdx((a) => Math.max(0, a - delta));
    }
    prevTrimRef.current = trimOffset;
  }, [trimOffset, vh]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || vh === 0) return;

    isScrollingRef.current = true;
    window.clearTimeout(scrollEndTimer.current);

    const idx = Math.round(el.scrollTop / vh);
    if (idx !== activeIdxRef.current) {
      activeIdxRef.current = idx;
      setActiveIdx(idx);
    }
    if (totalVirtual > 0 && idx >= totalVirtual - 3) {
      loadNext();
    }

    // Reset isScrolling after snap settles
    scrollEndTimer.current = window.setTimeout(() => {
      isScrollingRef.current = false;
    }, 200);
  }, [vh, totalVirtual, loadNext]);

  // navegação por teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (isScrollingRef.current) return; // ignore se já está rolando
      const realVh = el.clientHeight > 0 ? el.clientHeight : vh;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const next = Math.min(activeIdxRef.current + 1, totalVirtual - 1);
        activeIdxRef.current = next;
        setActiveIdx(next);
        el.scrollTop = next * realVh;
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const prev = Math.max(0, activeIdxRef.current - 1);
        activeIdxRef.current = prev;
        setActiveIdx(prev);
        el.scrollTop = prev * realVh;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vh, totalVirtual]);

  const handleRefresh = useCallback(() => {
    refreshFeed();
    setActiveIdx(0);
    activeIdxRef.current = 0;
    const el = containerRef.current;
    if (el) el.scrollTop = 0;
  }, [refreshFeed]);

  useEffect(() => () => window.clearTimeout(scrollEndTimer.current), []);

  if (items.length === 0 && !loading) {
    return (
      <div className="empty-state">
        <p>Nenhuma mídia para exibir.</p>
        {isForYou && (
          <>
            <p style={{ fontSize: 13, color: '#777' }}>
              Adicione uma pasta na aba <strong>Perfis</strong> para começar.
            </p>
            <button className="cta" onClick={() => setActiveTab('library')}>
              Ir para Perfis
            </button>
          </>
        )}
      </div>
    );
  }

  // janela do DOM: apenas [activeIdx-RADIUS, activeIdx+RADIUS]
  const winStart = Math.max(trimOffset, activeIdx - RENDER_RADIUS);
  const winEnd = Math.min(totalVirtual, activeIdx + RENDER_RADIUS + 1);
  const rendered: { absI: number; item: MediaItem }[] = [];
  for (let absI = winStart; absI < winEnd; absI++) {
    const arrI = absI - trimOffset;
    if (arrI >= 0 && arrI < items.length) {
      rendered.push({ absI, item: items[arrI] });
    }
  }

  /*
   * Estrutura do DOM:
   *   feed-view (scroll-snap: y mandatory)
   *     feed-spacer (flex column, cada child = 1 slot de snap)
   *       .feed-slot × N (cada slot tem height: vh, no fluxo normal)
   *         .feed-snap-anchor (alvo invisível do snap)
   *         .feed-item-virtual (absoluto, conteúdo real)
   *
   * Slots vazios (fora do RENDER_RADIUS) só têm o anchor → snap funciona.
   * Slots renderizados têm anchor + conteúdo → snap + conteúdo.
   */

  // Mapeia slots renderizados por absI para lookup O(1)
  const renderedMap = new Map<number, MediaItem>();
  for (const { absI, item } of rendered) {
    renderedMap.set(absI, item);
  }

  // Gerar todos os slots visíveis na janela de scroll (+ margem)
  // Slots fora do RENDER_RADIUS são apenas anchors vazios (para o snap funcionar)
  const scrollMargin = RENDER_RADIUS + 1;
  const slotStart = Math.max(0, activeIdx - scrollMargin);
  const slotEnd = Math.min(totalVirtual, activeIdx + scrollMargin + 1);

  return (
    <div className="feed-view" ref={containerRef} onScroll={handleScroll}>
      {isForYou && (
        <button className="feed-refresh-btn" onClick={handleRefresh} title="Atualizar feed">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
        </button>
      )}
      <div className="feed-spacer">
        {/* Slots não-renderizados antes da janela (apenas altura) */}
        {slotStart > 0 && (
          <div style={{ height: slotStart * vh }} />
        )}

        {/* Slots com anchors de snap */}
        {Array.from({ length: slotEnd - slotStart }, (_, i) => {
          const absI = slotStart + i;
          const item = renderedMap.get(absI);
          const isActive = activeIdx === absI;

          return (
            <div className="feed-slot" key={absI}>
              {/* Anchor invisível no fluxo → alvo do scroll-snap */}
              <div className="feed-snap-anchor" />

              {/* Conteúdo real (apenas se dentro do RENDER_RADIUS) */}
              {item && (
                <div
                  className={`feed-item-virtual${isActive ? ' active' : ''}`}
                >
                  <MediaCard
                    item={item}
                    active={isActive}
                    isFavFile={favFiles.has(item.path)}
                    isFavFolder={
                      favFolders.has(item.profilePath) ||
                      (item.albumPath ? favFolders.has(item.albumPath) : false)
                    }
                    onToggleFavFile={() => toggleFile(item.path)}
                    onToggleFavFolder={() => {
                      const target = item.albumPath ?? item.profilePath;
                      toggleFolder(target);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Slots restantes após a janela (apenas altura) */}
        {slotEnd < totalVirtual && (
          <div style={{ height: (totalVirtual - slotEnd) * vh }} />
        )}

        {loading && <div className="feed-loading"><div className="spinner" /></div>}
      </div>
    </div>
  );
}
