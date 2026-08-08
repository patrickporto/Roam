import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../shared/types';

interface MediaGridProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  onReachEnd?: () => void;
  loading?: boolean;
  /** Quando presente, exibe um coração no tile para desfavoritar. */
  onUnfavorite?: (item: MediaItem) => void;
}

const SKELETON_COUNT = 8;

/** Vídeo da grade: só recebe `src` quando se aproxima do viewport. */
function TileVideo({ item }: { item: MediaItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="tile-video" ref={ref}>
      {near && <video src={item.mediaUrl} muted preload="metadata" />}
      <span className="tile-play">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      </span>
    </div>
  );
}

/** Grade de miniaturas estilo TikTok (perfil/favoritos). */
export function MediaGrid({ items, onSelect, onReachEnd, loading = false, onUnfavorite }: MediaGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;

  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    });
  }, [items]);

  // Sentinela no fim da grade: dispara ao ficar visível, independente de
  // qual ancestral é o container de scroll. O observer é recriado a cada
  // página carregada — como o IO sempre emite um callback inicial ao
  // observar, isso re-dispara enquanto o fim continuar visível (conteúdo
  // menor que o viewport), até o cursor do backend se esgotar.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onReachEndRef.current?.();
        }
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueItems.length]);

  return (
    <div className="media-grid">
      {uniqueItems.map((item) => (
        <button
          key={item.path}
          className="media-tile"
          onClick={() => onSelect(item)}
          title={item.name}
        >
          {item.type === 'image' ? (
            <img src={item.mediaUrl} alt={item.name} loading="lazy" decoding="async" />
          ) : (
            <TileVideo item={item} />
          )}
          <span className="tile-format">{item.format.toUpperCase()}</span>
          {onUnfavorite && (
            <button
              className="tile-unfavorite"
              title="Remover dos favoritos"
              onClick={(e) => {
                e.stopPropagation();
                onUnfavorite(item);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          )}
        </button>
      ))}
      {loading &&
        Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={`skeleton-${i}`} className="media-tile skeleton" />
        ))}
      <div ref={sentinelRef} className="grid-sentinel" />
    </div>
  );
}
