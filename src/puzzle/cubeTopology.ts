import { Direction, DIR_DELTA } from './types';

export interface CubeStep {
  face: number;
  r: number;
  c: number;
  dir: Direction;
}

/**
 * Utför ett ortogonalt steg på kuben i riktning dir.
 * Om steget korsar en kubsides-kant, beräknas grannsidan och koordinaterna med
 * 100% matematisk reversibilitet (reciprocitet).
 */
export function stepOnCube(
  f: number,
  r: number,
  c: number,
  d: Direction,
  N: number
): CubeStep {
  const { dr, dc } = DIR_DELTA[d];
  const nextR = r + dr;
  const nextC = c + dc;

  if (nextR >= 0 && nextR < N && nextC >= 0 && nextC < N) {
    return { face: f, r: nextR, c: nextC, dir: d };
  }

  // Horisontellt band: Left (1), Front (4), Right (0), Back (5)
  if (d === 'RIGHT') {
    if (f === 1) return { face: 4, r: r, c: 0, dir: 'RIGHT' };
    if (f === 4) return { face: 0, r: r, c: 0, dir: 'RIGHT' };
    if (f === 0) return { face: 5, r: r, c: 0, dir: 'RIGHT' };
    if (f === 5) return { face: 1, r: r, c: 0, dir: 'RIGHT' };
  }
  if (d === 'LEFT') {
    if (f === 4) return { face: 1, r: r, c: N - 1, dir: 'LEFT' };
    if (f === 1) return { face: 5, r: r, c: N - 1, dir: 'LEFT' };
    if (f === 5) return { face: 0, r: r, c: N - 1, dir: 'LEFT' };
    if (f === 0) return { face: 4, r: r, c: N - 1, dir: 'LEFT' };
  }

  // Top (2) övergångar
  if (f === 4 && d === 'UP') return { face: 2, r: N - 1, c: c, dir: 'UP' };
  if (f === 2 && d === 'DOWN') return { face: 4, r: 0, c: c, dir: 'DOWN' };

  if (f === 2 && d === 'UP') return { face: 5, r: 0, c: N - 1 - c, dir: 'DOWN' };
  if (f === 5 && d === 'UP') return { face: 2, r: 0, c: N - 1 - c, dir: 'DOWN' };

  if (f === 2 && d === 'LEFT') return { face: 1, r: 0, c: r, dir: 'DOWN' };
  if (f === 1 && d === 'UP') return { face: 2, r: c, c: 0, dir: 'RIGHT' };

  if (f === 2 && d === 'RIGHT') return { face: 0, r: 0, c: N - 1 - r, dir: 'DOWN' };
  if (f === 0 && d === 'UP') return { face: 2, r: N - 1 - c, c: N - 1, dir: 'LEFT' };

  // Bottom (3) övergångar
  if (f === 4 && d === 'DOWN') return { face: 3, r: 0, c: c, dir: 'DOWN' };
  if (f === 3 && d === 'UP') return { face: 4, r: N - 1, c: c, dir: 'UP' };

  if (f === 3 && d === 'DOWN') return { face: 5, r: N - 1, c: N - 1 - c, dir: 'UP' };
  if (f === 5 && d === 'DOWN') return { face: 3, r: N - 1, c: N - 1 - c, dir: 'UP' };

  if (f === 3 && d === 'LEFT') return { face: 1, r: N - 1, c: N - 1 - r, dir: 'UP' };
  if (f === 1 && d === 'DOWN') return { face: 3, r: N - 1 - c, c: 0, dir: 'RIGHT' };

  if (f === 3 && d === 'RIGHT') return { face: 0, r: N - 1, c: r, dir: 'UP' };
  if (f === 0 && d === 'DOWN') return { face: 3, r: c, c: N - 1, dir: 'LEFT' };

  return { face: f, r, c, dir: d };
}
