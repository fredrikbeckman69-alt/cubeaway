export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type ArrowType = 'normal' | 'frozen' | 'linked';
export type GameMode = 'classic' | 'time_attack' | 'zen';

export interface CubeCoord {
  faceIdx: number;
  r: number;
  c: number;
}

export interface Arrow {
  id: string;
  cells: CubeCoord[];
  head: CubeCoord;
  dir: Direction;
  color?: string;
  type?: ArrowType;
  isFrozen?: boolean;
  linkedWithId?: string;
}

export interface LevelConfig {
  levelNumber: number;
  gridSize: number;
  targetArrowCountPerFace: number;
  maxPathLength: number;
}

export const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  UP: { dr: -1, dc: 0 },
  DOWN: { dr: 1, dc: 0 },
  LEFT: { dr: 0, dc: -1 },
  RIGHT: { dr: 0, dc: 1 },
};

export const CUBE_FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
