import { Arrow, CubeCoord, Direction, DIR_DELTA, LevelConfig } from './types';
import { stepOnCube } from './cubeTopology';

export class PRNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  // Mulberry32
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/**
 * Svårighetsgradskurva för 1000 nivåer.
 * Massivt, tätt 20x20-rutnät likt referensbilderna,
 * med en blandning av korta, medellånga och långa slingrande pilar (upp till 30-36 celler långa).
 */
export function getLevelConfig(level: number): LevelConfig {
  const lvl = Math.max(1, Math.min(1000, Math.floor(level)));

  let gridSize: number;
  let targetArrowCountPerFace: number;
  let maxPathLength: number;

  if (lvl <= 20) {
    gridSize = 20;
    maxPathLength = 32;
    targetArrowCountPerFace = 52;
  } else if (lvl <= 100) {
    const t = (lvl - 20) / 80;
    gridSize = 20;
    maxPathLength = 32;
    targetArrowCountPerFace = Math.round(52 + t * 4);
  } else if (lvl <= 350) {
    const t = (lvl - 100) / 250;
    gridSize = 22;
    maxPathLength = 34;
    targetArrowCountPerFace = Math.round(56 + t * 6);
  } else if (lvl <= 700) {
    const t = (lvl - 350) / 350;
    gridSize = 22;
    maxPathLength = 36;
    targetArrowCountPerFace = Math.round(62 + t * 6);
  } else if (lvl <= 950) {
    const t = (lvl - 700) / 250;
    gridSize = 24;
    maxPathLength = 38;
    targetArrowCountPerFace = Math.round(35 - t * 15); // 35 ner till 20 per sida
  } else {
    // Grandmaster (951 - 1000): Strikt sekventiell lösning (1 pil i taget)
    gridSize = 24;
    maxPathLength = 38;
    targetArrowCountPerFace = 14; // ~84 pilar totalt, ren domino-kedja
  }

  return {
    levelNumber: lvl,
    gridSize,
    targetArrowCountPerFace,
    maxPathLength,
  };
}

export function canArrowFly(
  arrow: Arrow,
  grids: (string | null)[][][],
  gridSize: number
): boolean {
  const { dr, dc } = DIR_DELTA[arrow.dir];
  const headFace = arrow.head.faceIdx;
  let currR = arrow.head.r + dr;
  let currC = arrow.head.c + dc;

  // Kontrollera att strålen från huvudet rakt mot kanten på den sidan är 100% tom
  // Om något finns i vägen (en annan pil eller del av samma pil) är den blockerad!
  while (currR >= 0 && currR < gridSize && currC >= 0 && currC < gridSize) {
    const occ = grids[headFace][currR][currC];
    if (occ !== null) {
      return false;
    }
    currR += dr;
    currC += dc;
  }
  return true;
}

function isCellInExitRay(
  head: CubeCoord,
  dir: Direction,
  cell: { faceIdx?: number; face?: number; r: number; c: number },
  gridSize: number
): boolean {
  const cellFace = cell.faceIdx !== undefined ? cell.faceIdx : cell.face!;
  if (cellFace !== head.faceIdx) return false;
  const { dr, dc } = DIR_DELTA[dir];
  let cr = head.r + dr;
  let cc = head.c + dc;
  while (cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize) {
    if (cr === cell.r && cc === cell.c) return true;
    cr += dr;
    cc += dc;
  }
  return false;
}

const ALL_DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/**
 * Slumpar fram längd på pilen så att vissa pilar blir härligt långa!
 * - 52% Korta/snabba pilar (3 - 6 celler)
 * - 25% Medellånga pilar (7 - 12 celler)
 * - 16% Långa slingrande pilar (13 - 22 celler)
 * - 7% Extra långa episka pilar (23 - 35 celler)
 */
function chooseTargetLength(prng: PRNG, maxPathLen: number): number {
  const roll = prng.next();
  if (roll < 0.52) {
    return prng.nextInt(3, 6);
  } else if (roll < 0.77) {
    return prng.nextInt(7, 12);
  } else if (roll < 0.93) {
    return prng.nextInt(13, Math.min(22, maxPathLen));
  } else {
    return prng.nextInt(23, maxPathLen);
  }
}

/**
 * Genererar hela kubens pussel med garanterad 100% lösbarhet och progressiv svårighetskurva:
 * - Nivå 1-20: Många fria pilar initialt (avslappnad start).
 * - Nivå 21-700: Gradvis tätare beroenden och färre fria pilar.
 * - Nivå 701-1000: Extremt tajta flaskhalsar (på de sista nivåerna strikt 1 pil i taget!).
 */
export function generateCubePuzzle(levelNumber: number): {
  config: LevelConfig;
  allArrows: Arrow[];
  initialGrids: (string | null)[][][];
} {
  const prng = new PRNG(levelNumber * 10007 + 7919);
  const config = getLevelConfig(levelNumber);
  const { gridSize, targetArrowCountPerFace, maxPathLength } = config;
  const lvl = config.levelNumber;

  let round0Cap: number;
  let baseMaxDeps: number;
  let requireBlockerProb: number;

  if (lvl <= 20) {
    round0Cap = 120;
    baseMaxDeps = 999;
    requireBlockerProb = 0.0;
  } else if (lvl <= 100) {
    const t = (lvl - 20) / 80;
    round0Cap = Math.round(70 - t * 45); // 70 ner till 25
    baseMaxDeps = Math.round(6 - t * 2);
    requireBlockerProb = 0.30 + t * 0.40;
  } else if (lvl <= 350) {
    const t = (lvl - 100) / 250;
    round0Cap = Math.round(20 - t * 14); // 20 ner till 6
    baseMaxDeps = 3;
    requireBlockerProb = 0.70 + t * 0.20;
  } else if (lvl <= 700) {
    const t = (lvl - 350) / 350;
    round0Cap = Math.round(6 - t * 4); // 6 ner till 2
    baseMaxDeps = 2;
    requireBlockerProb = 0.90 + t * 0.08;
  } else if (lvl <= 950) {
    round0Cap = 1;
    baseMaxDeps = 1;
    requireBlockerProb = 1.0;
  } else {
    // Grandmaster: 1 pil i taget
    round0Cap = 1;
    baseMaxDeps = 1;
    requireBlockerProb = 1.0;
  }

  const totalTargetArrows = targetArrowCountPerFace * 6;

  // grids[faceIdx][r][c] = arrowId | null
  const grids: (string | null)[][][] = Array.from({ length: 6 }, () =>
    Array.from({ length: gridSize }, () => Array(gridSize).fill(null))
  );

  const arrowRoundMap = new Map<string, number>();
  const placedArrows: Arrow[] = [];
  const directBlockedCount = new Map<string, number>();

  // Reserverade utgångsstrålar för att garantera noll deadlocks
  const reservedExitRays: number[][][] = Array.from({ length: 6 }, () =>
    Array.from({ length: gridSize }, () => Array(gridSize).fill(999999))
  );

  const maxRounds = 500;
  let consecutiveFailures = 0;

  for (let round = 0; round < maxRounds && placedArrows.length < totalTargetArrows; round++) {
    const roundLimit = round === 0 ? round0Cap : 1;
    let placedInRound = 0;
    const maxAttempts = 180;

    const relaxationThreshold = lvl > 950 ? 99999 : (lvl > 700 ? 50 : 25);
    const effectiveMaxDeps = consecutiveFailures > relaxationThreshold ? baseMaxDeps + 1 : baseMaxDeps;

    for (let attempt = 0; attempt < maxAttempts && placedInRound < roundLimit && placedArrows.length < totalTargetArrows; attempt++) {
      let face = prng.nextInt(0, 5);
      const candidateHeads: { head: CubeCoord; behind: CubeCoord; dir: Direction; firstBlocker: string | null }[] = [];

      const eligibleTargets = placedArrows.filter(
        (a) => (directBlockedCount.get(a.id) || 0) < effectiveMaxDeps
      );

      // Riktad placering mot existerande pilar för att skapa tajta beroendekedjor
      if (round > 0 && eligibleTargets.length > 0 && prng.next() < (lvl > 700 ? 0.96 : 0.75)) {
        const target = prng.choice(eligibleTargets);
        const cell = prng.choice(target.cells);
        face = cell.faceIdx;

        for (const dir of ALL_DIRECTIONS) {
          const { dr, dc } = DIR_DELTA[dir];
          for (let dist = 1; dist <= gridSize - 1; dist++) {
            const r = cell.r - dr * dist;
            const c = cell.c - dc * dist;
            if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;
            if (grids[face][r][c] !== null) continue;
            if (reservedExitRays[face][r][c] <= round) continue;

            const behindR = r - dr;
            const behindC = c - dc;
            if (behindR < 0 || behindR >= gridSize || behindC < 0 || behindC >= gridSize) continue;
            if (grids[face][behindR][behindC] !== null) continue;
            if (reservedExitRays[face][behindR][behindC] <= round) continue;

            let cr = r + dr;
            let cc = c + dc;
            let clear = true;
            let firstBlocker: string | null = null;

            while (cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize) {
              const occ = grids[face][cr][cc];
              if (occ !== null) {
                const occRound = arrowRoundMap.get(occ);
                if (occRound === undefined || occRound >= round) {
                  clear = false;
                  break;
                } else if (!firstBlocker) {
                  firstBlocker = occ;
                }
              }
              cr += dr;
              cc += dc;
            }

            if (!firstBlocker) clear = false;
            if (firstBlocker && (directBlockedCount.get(firstBlocker) || 0) >= effectiveMaxDeps) clear = false;

            if (clear) {
              candidateHeads.push({
                head: { faceIdx: face, r, c },
                behind: { faceIdx: face, r: behindR, c: behindC },
                dir,
                firstBlocker,
              });
            }
          }
        }
      }

      // Sökning över kubsidan vid behov
      if (candidateHeads.length === 0) {
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (grids[face][r][c] !== null) continue;
            if (reservedExitRays[face][r][c] <= round) continue;

            for (const dir of ALL_DIRECTIONS) {
              const { dr, dc } = DIR_DELTA[dir];
              const behindR = r - dr;
              const behindC = c - dc;

              if (behindR < 0 || behindR >= gridSize || behindC < 0 || behindC >= gridSize) continue;
              if (grids[face][behindR][behindC] !== null) continue;
              if (reservedExitRays[face][behindR][behindC] <= round) continue;

              let cr = r + dr;
              let cc = c + dc;
              let clear = true;
              let firstBlocker: string | null = null;

              while (cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize) {
                const occ = grids[face][cr][cc];
                if (occ !== null) {
                  const occRound = arrowRoundMap.get(occ);
                  if (occRound === undefined || occRound >= round) {
                    clear = false;
                    break;
                  } else if (!firstBlocker) {
                    firstBlocker = occ;
                  }
                }
                cr += dr;
                cc += dc;
              }

              if (round > 0 && requireBlockerProb >= 1.0 && !firstBlocker) clear = false;
              else if (round > 0 && prng.next() < requireBlockerProb && !firstBlocker) clear = false;
              if (firstBlocker && effectiveMaxDeps < 999 && (directBlockedCount.get(firstBlocker) || 0) >= effectiveMaxDeps) clear = false;

              if (clear) {
                candidateHeads.push({
                  head: { faceIdx: face, r, c },
                  behind: { faceIdx: face, r: behindR, c: behindC },
                  dir,
                  firstBlocker,
                });
              }
            }
          }
        }
      }

      if (candidateHeads.length === 0) continue;
      const chosen = prng.choice(candidateHeads);
      const { head, behind, dir, firstBlocker } = chosen;

      const path: CubeCoord[] = [behind, head];
      const targetLen = chooseTargetLength(prng, maxPathLength);
      let curr = behind;

      let lastBackDir: Direction = 'UP';
      const { dr, dc } = DIR_DELTA[dir];
      if (dr === 1 && dc === 0) lastBackDir = 'UP';
      else if (dr === -1 && dc === 0) lastBackDir = 'DOWN';
      else if (dr === 0 && dc === 1) lastBackDir = 'LEFT';
      else if (dr === 0 && dc === -1) lastBackDir = 'RIGHT';

      let straightCount = 1;

      for (let step = 2; step < targetLen; step++) {
        interface ValidNeighbor {
          coord: CubeCoord;
          dir: Direction;
          crossesCorner: boolean;
        }
        const neighbors: ValidNeighbor[] = [];

        for (const d of ALL_DIRECTIONS) {
          const nextStep = stepOnCube(curr.faceIdx, curr.r, curr.c, d, gridSize);
          if (grids[nextStep.face][nextStep.r][nextStep.c] !== null) continue;
          if (path.some((p) => p.faceIdx === nextStep.face && p.r === nextStep.r && p.c === nextStep.c)) continue;
          if (isCellInExitRay(head, dir, nextStep, gridSize)) continue;
          if (reservedExitRays[nextStep.face][nextStep.r][nextStep.c] <= round) continue;

          neighbors.push({
            coord: { faceIdx: nextStep.face, r: nextStep.r, c: nextStep.c },
            dir: d,
            crossesCorner: nextStep.face !== curr.faceIdx,
          });
        }

        if (neighbors.length === 0) break;

        const straightNeighbor = neighbors.find((n) => n.dir === lastBackDir);
        const cornerNeighbors = neighbors.filter((n) => n.crossesCorner);
        let chosenNeighbor: ValidNeighbor;

        if (cornerNeighbors.length > 0 && prng.next() < 0.42) {
          chosenNeighbor = prng.choice(cornerNeighbors);
        } else if (straightNeighbor && straightCount < 2) {
          chosenNeighbor = straightNeighbor;
        } else if (straightNeighbor && straightCount < 7 && prng.next() < 0.68) {
          chosenNeighbor = straightNeighbor;
        } else {
          const turns = neighbors.filter((n) => n.dir !== lastBackDir);
          chosenNeighbor = turns.length > 0 ? prng.choice(turns) : prng.choice(neighbors);
        }

        if (chosenNeighbor.dir === lastBackDir) straightCount++;
        else {
          lastBackDir = chosenNeighbor.dir;
          straightCount = 1;
        }

        curr = chosenNeighbor.coord;
        path.unshift(curr);
      }

      if (path.length >= 2) {
        const arrowId = `a_${placedArrows.length}_${head.faceIdx}_${head.r}_${head.c}`;
        for (const cell of path) {
          grids[cell.faceIdx][cell.r][cell.c] = arrowId;
        }
        arrowRoundMap.set(arrowId, round);

        if (firstBlocker) {
          directBlockedCount.set(firstBlocker, (directBlockedCount.get(firstBlocker) || 0) + 1);
        }

        let cr = head.r + dr;
        let cc = head.c + dc;
        while (cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize) {
          if (round < reservedExitRays[head.faceIdx][cr][cc]) {
            reservedExitRays[head.faceIdx][cr][cc] = round;
          }
          cr += dr;
          cc += dc;
        }

        placedArrows.push({ id: arrowId, cells: path, head, dir });
        placedInRound++;
        consecutiveFailures = 0;
      }
    }

    if (placedInRound === 0) {
      consecutiveFailures++;
    }
  }

  // Verifiera att pusslet är 100% lösbart
  const verifiedArrows = solveAndFilterGlobal(placedArrows, grids, gridSize);

  // Bygg upp det slutgiltiga gridet
  const finalGrids: (string | null)[][][] = Array.from({ length: 6 }, () =>
    Array.from({ length: gridSize }, () => Array(gridSize).fill(null))
  );
  for (const arrow of verifiedArrows) {
    for (const cell of arrow.cells) {
      finalGrids[cell.faceIdx][cell.r][cell.c] = arrow.id;
    }
  }

  return { config, allArrows: verifiedArrows, initialGrids: finalGrids };
}

/**
 * Global lösare för att säkerställa 100% lösbarhet över hela kuben
 */
function solveAndFilterGlobal(
  arrows: Arrow[],
  originalGrids: (string | null)[][][],
  gridSize: number
): Arrow[] {
  const simGrids: (string | null)[][][] = Array.from({ length: 6 }, (_, f) =>
    originalGrids[f].map((row) => [...row])
  );

  const remaining = new Map<string, Arrow>();
  for (const a of arrows) remaining.set(a.id, a);

  let changed = true;
  while (changed && remaining.size > 0) {
    changed = false;
    for (const [id, a] of remaining.entries()) {
      if (canArrowFly(a, simGrids, gridSize)) {
        for (const c of a.cells) {
          simGrids[c.faceIdx][c.r][c.c] = null;
        }
        remaining.delete(id);
        changed = true;
      }
    }
  }

  if (remaining.size === 0) {
    return arrows;
  }

  const solvableIds = new Set(arrows.map((a) => a.id).filter((id) => !remaining.has(id)));
  return arrows.filter((a) => solvableIds.has(a.id));
}
