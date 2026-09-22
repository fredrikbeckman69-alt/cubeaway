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

  if (lvl <= 50) {
    gridSize = 20;
    targetArrowCountPerFace = 52 + Math.floor(lvl * 0.16); // 52 till 60 pilar per sida (tätt fylld kub med långa slingrande pilar)
    maxPathLength = 32;
  } else if (lvl <= 200) {
    const t = (lvl - 50) / 150;
    gridSize = 20;
    targetArrowCountPerFace = Math.round(60 + t * 12); // 60 till 72
    maxPathLength = 34;
  } else if (lvl <= 500) {
    const t = (lvl - 200) / 300;
    gridSize = 22;
    targetArrowCountPerFace = Math.round(75 + t * 18); // 75 till 93
    maxPathLength = 36;
  } else {
    const t = (lvl - 500) / 500;
    gridSize = 24;
    targetArrowCountPerFace = Math.round(95 + t * 25); // 95 till 120
    maxPathLength = 38;
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
 * Genererar hela kubens pussel med garanterad 100% lösbarhet.
 * Innehåller en blandning av korta, medel och långa pilar med vackra labyrintkorridorer.
 */
export function generateCubePuzzle(levelNumber: number): {
  config: LevelConfig;
  allArrows: Arrow[];
  initialGrids: (string | null)[][][];
} {
  const prng = new PRNG(levelNumber * 10007 + 7919);
  const config = getLevelConfig(levelNumber);
  const { gridSize, targetArrowCountPerFace, maxPathLength } = config;

  const totalTargetArrows = targetArrowCountPerFace * 6;

  // grids[faceIdx][r][c] = arrowId | null
  const grids: (string | null)[][][] = Array.from({ length: 6 }, () =>
    Array.from({ length: gridSize }, () => Array(gridSize).fill(null))
  );

  const arrowRoundMap = new Map<string, number>();
  const placedArrows: Arrow[] = [];

  const maxRounds = 38;

  for (let round = 0; round < maxRounds && placedArrows.length < totalTargetArrows; round++) {
    const maxAttemptsPerRound = 700;

    for (
      let attempt = 0;
      attempt < maxAttemptsPerRound && placedArrows.length < totalTargetArrows;
      attempt++
    ) {
      // Välj en slumpmässig sida för pilens huvud
      const face = prng.nextInt(0, 5);

      const candidateHeads: { head: CubeCoord; behind: CubeCoord; dir: Direction }[] = [];

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (grids[face][r][c] !== null) continue;

          for (const dir of ALL_DIRECTIONS) {
            const { dr, dc } = DIR_DELTA[dir];
            const behindR = r - dr;
            const behindC = c - dc;

            // Se till att cellen bakom huvudet är på SAMMA sida och är tom
            // så att pilspetsen alltid ansluter spikrakt i rätt riktning
            if (behindR < 0 || behindR >= gridSize || behindC < 0 || behindC >= gridSize) {
              continue;
            }
            if (grids[face][behindR][behindC] !== null) {
              continue;
            }

            // Kontrollera utgångsvägen mot kanten
            let cr = r + dr;
            let cc = c + dc;
            let clear = true;

            while (cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize) {
              const occ = grids[face][cr][cc];
              if (occ !== null) {
                const occRound = arrowRoundMap.get(occ);
                if (occRound === undefined || occRound >= round) {
                  clear = false;
                  break;
                }
              }
              cr += dr;
              cc += dc;
            }

            if (clear) {
              candidateHeads.push({
                head: { faceIdx: face, r, c },
                behind: { faceIdx: face, r: behindR, c: behindC },
                dir,
              });
            }
          }
        }
      }

      if (candidateHeads.length === 0) continue;

      const chosen = prng.choice(candidateHeads);
      const { head, behind, dir } = chosen;

      const path: CubeCoord[] = [behind, head];
      const targetLen = chooseTargetLength(prng, maxPathLength);
      let curr = behind;

      // Bestäm initial bakåtriktning från head till behind
      let lastBackDir: Direction = 'UP';
      const { dr, dc } = DIR_DELTA[dir];
      if (dr === 1 && dc === 0) lastBackDir = 'UP';
      else if (dr === -1 && dc === 0) lastBackDir = 'DOWN';
      else if (dr === 0 && dc === 1) lastBackDir = 'LEFT';
      else if (dr === 0 && dc === -1) lastBackDir = 'RIGHT';

      let straightCount = 1;

      // Bygg pilens kropp bakåt med riktningsmomentum för att skapa snygga långa korridorer
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
          if (
            path.some(
              (p) => p.faceIdx === nextStep.face && p.r === nextStep.r && p.c === nextStep.c
            )
          ) {
            continue;
          }
          // En pil får ALDRIG korsa eller placera sin egen kropp framför sin egen pilspets!
          if (isCellInExitRay(head, dir, nextStep, gridSize)) {
            continue;
          }
          neighbors.push({
            coord: { faceIdx: nextStep.face, r: nextStep.r, c: nextStep.c },
            dir: d,
            crossesCorner: nextStep.face !== curr.faceIdx,
          });
        }

        if (neighbors.length === 0) break;

        // Välj nästa steg med riktningsmomentum (fortsätt rakt för 3-7 steg innan 90-graders sväng)
        const straightNeighbor = neighbors.find((n) => n.dir === lastBackDir);
        const cornerNeighbors = neighbors.filter((n) => n.crossesCorner);
        let chosenNeighbor: ValidNeighbor;

        if (cornerNeighbors.length > 0 && prng.next() < 0.42) {
          // Korsa hörn till en angränsande kubsida
          chosenNeighbor = prng.choice(cornerNeighbors);
        } else if (straightNeighbor && straightCount < 2) {
          // Säkerställ minst 2 steg i samma riktning för rena korridorer
          chosenNeighbor = straightNeighbor;
        } else if (straightNeighbor && straightCount < 7 && prng.next() < 0.68) {
          // 68% chans att fortsätta rakt framåt
          chosenNeighbor = straightNeighbor;
        } else {
          // Sväng 90 grader
          const turns = neighbors.filter((n) => n.dir !== lastBackDir);
          if (turns.length > 0) {
            chosenNeighbor = prng.choice(turns);
          } else {
            chosenNeighbor = prng.choice(neighbors);
          }
        }

        if (chosenNeighbor.dir === lastBackDir) {
          straightCount++;
        } else {
          lastBackDir = chosenNeighbor.dir;
          straightCount = 1;
        }

        curr = chosenNeighbor.coord;
        path.unshift(curr); // Lägg till i svansen
      }

      if (path.length < 2) continue;

      const arrowId = `a_${placedArrows.length}_${head.faceIdx}_${head.r}_${head.c}`;

      for (const cell of path) {
        grids[cell.faceIdx][cell.r][cell.c] = arrowId;
      }

      arrowRoundMap.set(arrowId, round);

      placedArrows.push({
        id: arrowId,
        cells: path,
        head,
        dir,
      });
    }
  }

  // Verifiera att pusslet är 100% lösbart
  const verifiedArrows = solveAndFilterGlobal(placedArrows, grids, gridSize);
  const finalArrows = annotateSpecialArrows(verifiedArrows, config.levelNumber, prng);

  // Bygg upp det slutgiltiga gridet
  const finalGrids: (string | null)[][][] = Array.from({ length: 6 }, () =>
    Array.from({ length: gridSize }, () => Array(gridSize).fill(null))
  );
  for (const arrow of finalArrows) {
    for (const cell of arrow.cells) {
      finalGrids[cell.faceIdx][cell.r][cell.c] = arrow.id;
    }
  }

  return { config, allArrows: finalArrows, initialGrids: finalGrids };
}

/**
 * Berikar pusslet med specialpilar (frysta pilar och länkade pilar) från nivå 6 och uppåt.
 * Eftersom tilldelningen sker på redan validerade lösbara pilar förblir pusslet 100% lösbart.
 */
function annotateSpecialArrows(arrows: Arrow[], level: number, rng: PRNG): Arrow[] {
  if (level < 6 || arrows.length < 10) {
    return arrows.map((a) => ({ ...a, type: 'normal' as const, isFrozen: false }));
  }

  const result: Arrow[] = arrows.map((a) => ({
    ...a,
    type: 'normal' as const,
    isFrozen: false,
  }));

  const candidateIndices = result
    .map((a, idx) => ({ idx, len: a.cells.length }))
    .filter((item) => item.len >= 3)
    .map((item) => item.idx);

  const shuffled = rng.shuffle(candidateIndices);

  const maxFrozen = Math.min(5, Math.floor(1 + (level - 5) * 0.15));
  const maxLinkedPairs = Math.min(3, Math.floor(1 + (level - 5) * 0.1));

  let curr = 0;
  let frozenCount = 0;

  // 1. Frysta pilar
  while (curr < shuffled.length && frozenCount < maxFrozen) {
    const idx = shuffled[curr++];
    result[idx].type = 'frozen';
    result[idx].isFrozen = true;
    frozenCount++;
  }

  // 2. Länkade pilar i par
  let linkedPairs = 0;
  while (curr < shuffled.length - 1 && linkedPairs < maxLinkedPairs) {
    const i1 = shuffled[curr++];
    const i2 = shuffled[curr++];
    result[i1].type = 'linked';
    result[i2].type = 'linked';
    result[i1].linkedWithId = result[i2].id;
    result[i2].linkedWithId = result[i1].id;
    linkedPairs++;
  }

  return result;
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
