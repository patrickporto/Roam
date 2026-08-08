/**
 * Matemática pura de zoom/pan para mídia do feed.
 *
 * Modelo: transform CSS `translate(x, y) scale(s)` com `transform-origin: 0 0`
 * aplicado ao elemento de mídia dentro do card. (x, y) e o ponto do cursor
 * (px, py) são coordenadas em pixels relativas ao card.
 */

export interface ZoomTransform {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

export const IDENTITY: ZoomTransform = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Próxima escala a partir do deltaY de um evento de wheel (suave, exponencial). */
export function nextScale(scale: number, deltaY: number): number {
  return clampScale(scale * Math.exp(-deltaY * 0.0015));
}

/**
 * Aplica zoom centrado no ponto (px, py): o ponto sob o cursor permanece
 * visualmente estacionário. Voltar para escala 1 restaura a identidade.
 */
export function zoomAt(
  t: ZoomTransform,
  px: number,
  py: number,
  scaleRaw: number,
): ZoomTransform {
  const scale = clampScale(scaleRaw);
  if (scale === MIN_SCALE) return IDENTITY;
  const k = scale / t.scale;
  return {
    scale,
    x: px - (px - t.x) * k,
    y: py - (py - t.y) * k,
  };
}

/** Desloca a mídia ampliada por (dx, dy). Sem efeito em escala 1x. */
export function panBy(t: ZoomTransform, dx: number, dy: number): ZoomTransform {
  if (t.scale === MIN_SCALE) return t;
  return { scale: t.scale, x: t.x + dx, y: t.y + dy };
}
