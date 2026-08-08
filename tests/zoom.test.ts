import { describe, expect, it } from 'vitest';
import {
  clampScale,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  nextScale,
  panBy,
  zoomAt,
} from '../src/shared/zoom';

describe('clampScale', () => {
  it('limita ao intervalo [MIN_SCALE, MAX_SCALE]', () => {
    expect(clampScale(0.5)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });
});

describe('nextScale', () => {
  it('aumenta com scroll para cima (deltaY negativo)', () => {
    expect(nextScale(1, -100)).toBeGreaterThan(1);
  });

  it('diminui com scroll para baixo (deltaY positivo)', () => {
    const s = nextScale(2, 100);
    expect(s).toBeLessThan(2);
    expect(s).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('nunca fica abaixo de 1x', () => {
    expect(nextScale(1, 1000)).toBe(MIN_SCALE);
  });

  it('nunca ultrapassa o máximo', () => {
    expect(nextScale(MAX_SCALE, -1000)).toBe(MAX_SCALE);
  });
});

describe('zoomAt', () => {
  it('mantém o ponto sob o cursor estacionário', () => {
    const t = { scale: 2, x: -50, y: -30 };
    const px = 200;
    const py = 150;
    const next = zoomAt(t, px, py, 4);

    // ponto de conteúdo sob o cursor antes e depois deve ser o mesmo
    const contentBefore = { x: (px - t.x) / t.scale, y: (py - t.y) / t.scale };
    const contentAfter = {
      x: (px - next.x) / next.scale,
      y: (py - next.y) / next.scale,
    };
    expect(contentAfter.x).toBeCloseTo(contentBefore.x);
    expect(contentAfter.y).toBeCloseTo(contentBefore.y);
    expect(next.scale).toBe(4);
  });

  it('retorna identidade ao voltar para 1x', () => {
    const t = { scale: 3, x: 100, y: 50 };
    expect(zoomAt(t, 10, 10, 1)).toEqual(IDENTITY);
  });

  it('clampa escala acima do máximo', () => {
    expect(zoomAt(IDENTITY, 0, 0, 999).scale).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  it('desloca quando ampliado', () => {
    const t = { scale: 2, x: 10, y: 20 };
    expect(panBy(t, 5, -5)).toEqual({ scale: 2, x: 15, y: 15 });
  });

  it('não tem efeito em escala 1x', () => {
    expect(panBy(IDENTITY, 10, 10)).toBe(IDENTITY);
  });
});
