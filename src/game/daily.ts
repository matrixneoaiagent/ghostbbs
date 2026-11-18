import type {
  Cell,
  GameState,
  Grid,
  Level,
  MoveDirection,
  SpectreRoute,
  Tile,
} from './types.js';
import { applyMove, initGameState } from './engine.js';

const GRID_SIZE = 7;

/** Turn budget for one run, mirrored from the engine's timeout rule. */
const MAX_TURNS = 30;

// --- Date helpers ---

export function utcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Hash and PRNG ---

/**
 * djb2-style hash to a 32-bit unsigned integer.
 * This implementation is frozen — never change it once shipped,
 * or cross-device determinism breaks.
 */
export function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 PRNG returning values in [0, 1).
 * Stateful; each call advances the internal state.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    s = s >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// --- BFS ---

/**
 * BFS over (cell, collectedMask) state space.
 * Returns the shortest step count from playerStart to hatchCell
 * collecting all 3 fragments, or -1 if unsolvable.
 */
function bfsPar(
  grid: ReadonlyArray<ReadonlyArray<Tile>>,
  playerStart: Cell,
  fragmentCells: ReadonlyArray<Cell>,
  hatchCell: Cell
): number {
  const FRAGS = fragmentCells.length; // should be 3
  const goalMask = (1 << FRAGS) - 1;

  // Map fragment cells to bit positions
  const fragIndex = new Map<string, number>();
  fragmentCells.forEach((c, i) => fragIndex.set(`${c.row},${c.col}`, i));

  // State: row * 7 * col * 8 + mask  (7x7 grid, 8 mask values)
  const visited = new Uint8Array(GRID_SIZE * GRID_SIZE * (1 << FRAGS));
  const idx = (row: number, col: number, mask: number) =>
    (row * GRID_SIZE + col) * (1 << FRAGS) + mask;

  const queue: Array<{ row: number; col: number; mask: number; steps: number }> = [];
  const startMask = 0;
  visited[idx(playerStart.row, playerStart.col, startMask)] = 1;
  queue.push({ row: playerStart.row, col: playerStart.col, mask: startMask, steps: 0 });

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  let head = 0;
  while (head < queue.length) {
    const { row, col, mask, steps } = queue[head++];

    for (const { dr, dc } of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (grid[nr][nc] === 'wall') continue;

      let newMask = mask;
      const fragBit = fragIndex.get(`${nr},${nc}`);
      if (fragBit !== undefined) newMask |= 1 << fragBit;

      const stateIdx = idx(nr, nc, newMask);
      if (visited[stateIdx]) continue;
      visited[stateIdx] = 1;

      const newSteps = steps + 1;

      // Check goal: all fragments collected and on hatch
      if (newMask === goalMask && nr === hatchCell.row && nc === hatchCell.col) {
        return newSteps;
      }

      queue.push({ row: nr, col: nc, mask: newMask, steps: newSteps });
    }
  }

  return -1; // unsolvable
}

// --- Level generation ---

function generateLevelUnchecked(date: Date, salt = 0): Omit<Level, 'par'> {
  const seed = hash32('ghostbbs:' + utcDateString(date) + (salt ? ':' + salt : ''));
  const rng = mulberry32(seed);

  // Build floor grid
  const grid: Tile[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from<Tile>({ length: GRID_SIZE }).fill('floor')
  );

  // Place 8–12 walls on interior cells (rows 1–5, cols 1–5)
  const wallCount = 8 + Math.floor(rng() * 5); // 8..12
  for (let w = 0; w < wallCount; w++) {
    const r = 1 + Math.floor(rng() * 5);
    const c = 1 + Math.floor(rng() * 5);
    // Don't wall the player start
    if (r === 0 && c === 0) continue;
    grid[r][c] = 'wall';
  }

  // Player always starts at (0,0) — ensure it's floor
  grid[0][0] = 'floor';

  // Collect floor cells excluding (0,0)
  const floorCells: Cell[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (r === 0 && c === 0) continue;
      if (grid[r][c] === 'floor') floorCells.push({ row: r, col: c });
    }
  }

  // Fisher-Yates shuffle of floor cells
  for (let i = floorCells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = floorCells[i];
    floorCells[i] = floorCells[j];
    floorCells[j] = tmp;
  }

  // Pop 3 fragment cells, 1 hatch cell
  const fragmentCells: Cell[] = [];
  for (let i = 0; i < 3; i++) fragmentCells.push(floorCells.pop()!);
  const hatchCell = floorCells.pop()!;

  // Mark tiles
  for (const fc of fragmentCells) grid[fc.row][fc.col] = 'fragment';
  grid[hatchCell.row][hatchCell.col] = 'hatch';

  // Generate 2 or 3 spectre patrol routes
  const spectreCount = rng() < 0.5 ? 2 : 3;
  const spectreRoutes: SpectreRoute[] = [];

  for (let s = 0; s < spectreCount; s++) {
    // Pick a starting floor tile (all current floor cells plus fragment/hatch are walkable)
    const allWalkable: Cell[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] !== 'wall') allWalkable.push({ row: r, col: c });
      }
    }

    const startIdx = Math.floor(rng() * allWalkable.length);
    const route: Cell[] = [allWalkable[startIdx]];

    // 3–5 additional waypoints by walking random cardinal directions
    const extraWaypoints = 3 + Math.floor(rng() * 3); // 3..5
    const cardinalDirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (let w = 0; w < extraWaypoints; w++) {
      const last = route[route.length - 1];
      const dir = cardinalDirs[Math.floor(rng() * 4)];
      const nr = Math.max(0, Math.min(GRID_SIZE - 1, last.row + dir.dr));
      const nc = Math.max(0, Math.min(GRID_SIZE - 1, last.col + dir.dc));
      // Skip walls
      if (grid[nr][nc] !== 'wall') {
        route.push({ row: nr, col: nc });
      } else {
        // Stay in place as a waypoint (clamped to current)
        route.push({ row: last.row, col: last.col });
      }
    }

    spectreRoutes.push(route);
  }

  return {
    grid: grid as Grid,
    playerStart: { row: 0, col: 0 },
    fragmentCells,
    hatchCell,
    spectreRoutes,
  };
}

// --- Fallback level (hand-authored, BFS-verified offline) ---
//
// 7×7 open grid. Player at (0,0). Fragments at (0,2),(2,0),(4,4). Hatch at (6,6).
// Both spectres loop in the top-right corner (rows 0–1, cols 5–6), well clear of
// every cell on the BFS-optimal path. par = 16 (verified by test).

const _fallbackGrid: Tile[][] = Array.from({ length: GRID_SIZE }, () =>
  Array.from<Tile>({ length: GRID_SIZE }).fill('floor')
);
_fallbackGrid[0][2] = 'fragment';
_fallbackGrid[2][0] = 'fragment';
_fallbackGrid[4][4] = 'fragment';
_fallbackGrid[6][6] = 'hatch';

export const FALLBACK_LEVEL: Level = {
  grid: _fallbackGrid as Grid,
  playerStart: { row: 0, col: 0 },
  fragmentCells: [
    { row: 0, col: 2 },
    { row: 2, col: 0 },
    { row: 4, col: 4 },
  ],
  hatchCell: { row: 6, col: 6 },
  spectreRoutes: [
    // Clockwise loop: top-right corner, never within Chebyshev-2 of the optimal path
    [
      { row: 0, col: 5 },
      { row: 1, col: 5 },
      { row: 1, col: 6 },
      { row: 0, col: 6 },
    ],
    // Offset loop so the two spectres don't stack
    [
      { row: 1, col: 6 },
      { row: 0, col: 6 },
      { row: 0, col: 5 },
      { row: 1, col: 5 },
    ],
  ],
  // par = 16; confirmed by BFS in daily.test.ts
  par: 16,
};

// --- Public API ---

function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function spectreAt(level: Omit<Level, 'par'>, turn: number): Cell[] {
  return level.spectreRoutes.map(
    (route) => route[((turn % route.length) + route.length) % route.length]
  );
}

/**
 * The player must not be standing in a spectre's neighbourhood on turn 0, and
 * the very first move must have at least one survivable neighbour. Without this
 * a day can open with every legal move fatal.
 */
function startIsSafe(level: Omit<Level, 'par'>): boolean {
  const atZero = spectreAt(level, 0);
  if (atZero.some((s) => chebyshev(s, level.playerStart) <= 1)) return false;

  const atOne = spectreAt(level, 1);
  const neighbours: Cell[] = [
    { row: level.playerStart.row - 1, col: level.playerStart.col },
    { row: level.playerStart.row + 1, col: level.playerStart.col },
    { row: level.playerStart.row, col: level.playerStart.col - 1 },
    { row: level.playerStart.row, col: level.playerStart.col + 1 },
  ].filter(
    (c) =>
      c.row >= 0 &&
      c.row < GRID_SIZE &&
      c.col >= 0 &&
      c.col < GRID_SIZE &&
      level.grid[c.row][c.col] !== 'wall'
  );

  return neighbours.some((c) => atOne.every((s) => chebyshev(s, c) >= 2));
}

export function generateLevel(date: Date): Level {
  if (date == null) throw new Error('generateLevel: invalid date');

  for (let salt = 0; salt < 40; salt++) {
    const candidate = generateLevelUnchecked(date, salt);
    if (!startIsSafe(candidate)) continue;

    const par = bfsPar(
      candidate.grid,
      candidate.playerStart,
      candidate.fragmentCells,
      candidate.hatchCell
    );
    if (par === -1) continue;

    // BFS par ignores the spectres. A level can be "solvable" on paper while a
    // patrol route camps on the hatch or on a fragment, which makes every route
    // to it fatal. Require a line that survives the patrols, not just a path.
    if (!hasWinningLine(candidate)) continue;

    return { ...candidate, par };
  }

  // Nothing safe and solvable: use the hand-verified fallback.
  return FALLBACK_LEVEL;
}

/**
 * True when at least one move sequence reaches the hatch with all fragments and
 * never ends a turn within Chebyshev distance 1 of a spectre. Mirrors the real
 * turn resolution by replaying `applyMove` over the (cell, fragments, patrol
 * phase) state space; patrol phases are bounded by route lengths, so the search
 * is finite even though the turn budget is 30.
 */
export function hasWinningLine(level: Omit<Level, 'par'>): boolean {
  const probe: Level = { ...level, par: 0 };
  const start = initGameState(probe);
  const stateKey = (s: GameState): string =>
    `${s.playerPos.row},${s.playerPos.col},${s.collectedFragments},${s.spectreIndices.join('-')}`;
  const seen = new Set<string>([stateKey(start)]);
  const directions: MoveDirection[] = ['up', 'down', 'left', 'right'];

  let frontier: GameState[] = [start];
  for (let turn = 0; turn < MAX_TURNS && frontier.length > 0; turn++) {
    const next: GameState[] = [];
    for (const state of frontier) {
      for (const dir of directions) {
        const moved = applyMove(state, dir);
        if (moved.outcome === 'success') return true;
        if (moved.outcome !== 'playing') continue;
        const key = stateKey(moved);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(moved);
      }
    }
    frontier = next;
  }
  return false;
}
