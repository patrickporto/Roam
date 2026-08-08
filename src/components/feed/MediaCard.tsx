import { useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import { IDENTITY, nextScale, panBy, zoomAt, type ZoomTransform } from '../../shared/zoom';
import { useStore } from '../../store';

interface MediaCardProps {
  item: MediaItem;
  active: boolean;
  isFavFile: boolean;
  isFavFolder: boolean;
  onToggleFavFile: () => void;
  onToggleFavFolder: () => void;
}

/**
 * Hook que detecta a melhor estratégia de ajuste para a mídia.
 * Usa 'contain' para preservar a imagem/vídeo inteiro sem cortes.
 */
function useMediaFit(ref: React.RefObject<HTMLImageElement | HTMLVideoElement | null>) {
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {

      if (el instanceof HTMLVideoElement) {
        const vw = el.videoWidth;
        const vh = el.videoHeight;
        if (vw && vh) {
          setFit('contain');
        }
      } else if (el instanceof HTMLImageElement) {
        const nw = el.naturalWidth;
        const nh = el.naturalHeight;
        if (nw && nh) {
          setFit('contain');
        }
      }
    };

    // Para imagens, esperar o load. Para vídeos, esperar loadedmetadata.
    if (el instanceof HTMLImageElement) {
      if (el.complete) {
        check();
      } else {
        el.addEventListener('load', check);
        el.addEventListener('error', check);
      }
    } else if (el instanceof HTMLVideoElement) {
      el.addEventListener('loadedmetadata', check);
      el.addEventListener('error', check);
      // Fallback se metadata já carregou
      if (el.videoWidth) check();
    }

    // Recheck on resize
    const ro = new ResizeObserver(check);
    if (el.parentElement) ro.observe(el.parentElement);

    return () => {
      if (el.tagName === 'IMG') {
        el.removeEventListener('load', check);
        el.removeEventListener('error', check);
      } else {
        el.removeEventListener('loadedmetadata', check);
        el.removeEventListener('error', check);
      }
      ro.disconnect();
    };
  }, [ref]);

  return fit;
}

export function MediaCard({
  item,
  active,
  isFavFile,
  isFavFolder,
  onToggleFavFile,
  onToggleFavFolder,
}: MediaCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(false);
  const [zoom, setZoom] = useState<ZoomTransform>(IDENTITY);
  const [panning, setPanning] = useState(false);
  const zoomRef = useRef<ZoomTransform>(IDENTITY);
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const selectProfile = useStore((s) => s.selectProfile);

  const imageFit = useMediaFit(imageRef);
  const videoFit = useMediaFit(videoRef);

  const applyZoom = (t: ZoomTransform) => {
    zoomRef.current = t;
    setZoom(t);
  };

  // Zoom com Ctrl+scroll (também cobre pinch de trackpad, que emite ctrlKey).
  // Listener nativo não-passivo para poder cancelar a rolagem do feed.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const t = zoomRef.current;
      applyZoom(zoomAt(t, e.clientX - rect.left, e.clientY - rect.top, nextScale(t.scale, e.deltaY)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Reset de zoom por teclado (Esc ou Ctrl+0) apenas no card ativo
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (zoomRef.current.scale === 1) return;
      if (e.key === 'Escape' || (e.key === '0' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        applyZoom(IDENTITY);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Reset ao trocar de item ou quando o card deixa de ser o ativo
  useEffect(() => {
    applyZoom(IDENTITY);
  }, [item.path]);
  useEffect(() => {
    if (!active) applyZoom(IDENTITY);
  }, [active]);

  // Pan por arrasto quando ampliado (apenas iniciando sobre a mídia)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomRef.current.scale === 1 || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLImageElement) && !(target instanceof HTMLVideoElement)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    applyZoom(panBy(zoomRef.current, dx, dy));
    drag.startX = e.clientX;
    drag.startY = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Evita que o clique residual do arrasto pause o vídeo
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  const zoomed = zoom.scale > 1;
  const zoomStyle: React.CSSProperties = zoomed
    ? {
        transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
        transformOrigin: '0 0',
      }
    : {};

  const profileName = item.profilePath.split(/[\\/]/).pop() ?? '';
  const albumName = item.albumPath?.split(/[\\/]/).pop() ?? null;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || item.type !== 'video') return;
    if (active) {
      vid.currentTime = 0;
      setPaused(false);
      vid.play().catch(() => {});
    } else {
      vid.pause();
      if (vid.currentTime > 0) vid.currentTime = 0;
      setProgress(0);
      setPaused(false);
    }
  }, [active, item.type]);

  const handleVideoClick = () => {
    if (suppressClickRef.current) return;
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
  };

  const handleDoubleClick = () => {
    if (!isFavFile) onToggleFavFile();
    setBurst(true);
    window.setTimeout(() => setBurst(false), 750);
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    setProgress((vid.currentTime / vid.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    vid.currentTime = ratio * vid.duration;
    setProgress(ratio * 100);
  };

  return (
    <div
      ref={cardRef}
      className={`media-card${zoomed ? ' zoomed' : ''}${panning ? ' panning' : ''}`}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {item.type === 'image' ? (
        <img
          ref={imageRef}
          className="media-el"
          src={item.mediaUrl}
          alt={item.name}
          loading="lazy"
          draggable={false}
          style={{ objectFit: imageFit, ...zoomStyle }}
        />
      ) : (
        <video
          ref={videoRef}
          className="media-el"
          src={item.mediaUrl}
          muted={muted}
          loop
          playsInline
          draggable={false}
          preload={active ? 'auto' : 'metadata'}
          onClick={handleVideoClick}
          onTimeUpdate={handleTimeUpdate}
          style={{ objectFit: videoFit, ...zoomStyle }}
        />
      )}

      {burst && (
        <div className="heart-burst">
          <HeartIcon filled />
        </div>
      )}

      {item.type === 'video' && paused && active && (
        <div className="pause-flash">
          <PlayIcon />
        </div>
      )}

      <div className="gradient-top" />
      <div className="gradient-bottom" />

      <div className="info">
        <button
          className="info-username"
          onClick={() => selectProfile(item.profilePath)}
        >
          @{profileName}
        </button>
        {albumName && <div className="info-album">{albumName}</div>}
        <div className="info-caption">{item.name}</div>
        <div className="info-chips">
          <span>{item.format.toUpperCase()}</span>
          <span>{formatSize(item.size)}</span>
          <span>{formatDate(item.modifiedAt)}</span>
        </div>
      </div>

      <div className="rail">
        <button
          className="rail-avatar"
          onClick={() => selectProfile(item.profilePath)}
          title={`Ver perfil de ${profileName}`}
        >
          {profileName.charAt(0).toUpperCase()}
        </button>

        <button
          className={`rail-btn ${isFavFile ? 'on-like' : ''}`}
          onClick={onToggleFavFile}
          title={isFavFile ? 'Desfazer curtida' : 'Curtir'}
        >
          <HeartIcon filled={isFavFile} />
        </button>

        <button
          className={`rail-btn ${isFavFolder ? 'on-save' : ''}`}
          onClick={() =>
            onToggleFavFolder()
          }
          title={isFavFolder ? 'Remover pasta dos favoritos' : 'Favoritar pasta'}
        >
          <BookmarkIcon filled={isFavFolder} />
        </button>

        {item.type === 'video' && (
          <button
            className="rail-btn"
            onClick={() => setMuted((m) => !m)}
            title={muted ? 'Ativar som' : 'Silenciar'}
          >
            {muted ? <MuteIcon /> : <VolumeIcon />}
          </button>
        )}
      </div>

      {item.type === 'video' && (
        <div className="progress" onClick={handleSeek}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

/* ── Ícones SVG ── */

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

/* ── Formatters ── */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `${diffDays}d atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}sem`;
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}
