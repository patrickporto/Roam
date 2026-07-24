import { useEffect, useMemo, useRef } from 'react';
import type { MediaItem } from '../../shared/types';

interface MediaGridProps {
  items: MediaItem[];
  onSelect: (index: number) => void;
  onReachEnd?: () => void;
}

const isNearEnd = (el: HTMLElement) =>
  el.scrollTop + el.clientHeight >= el.scrollHeight - 400;

/** Grade de miniaturas estilo TikTok (perfil/favoritos). */
export function MediaGrid({ items, onSelect, onReachEnd }: MediaGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    });
  }, [items]);

  // Check if already at the end after items change (e.g. after pagination load).
  // This handles the case where content fits the viewport and no scroll occurs.
  useEffect(() => {
    if (!onReachEnd) return;
    const el = gridRef.current;
    if (!el) return;

    // Use requestAnimationFrame to wait for layout to settle after new items render
    const raf = requestAnimationFrame(() => {
      if (isNearEnd(el)) {
        onReachEnd();
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueItems.length]);

  return (
    <div
      ref={gridRef}
      className="media-grid"
      onScroll={() => {
        if (!onReachEnd) return;
        const el = gridRef.current;
        if (el && isNearEnd(el)) {
          onReachEnd();
        }
      }}
    >
      {uniqueItems.map((item, index) => (
        <button
          key={item.path}
          className="media-tile"
          onClick={() => onSelect(index)}
          title={item.name}
        >
          {item.type === 'image' ? (
            <img src={item.mediaUrl} alt={item.name} loading="lazy" />
          ) : (
            <div className="tile-video">
              <video src={item.mediaUrl} muted preload="metadata" />
              <span className="tile-play">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              </span>
            </div>
          )}
          <span className="tile-format">{item.format.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
