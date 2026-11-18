// Coordinates on the 7×7 grid (0-indexed, row-major)
export type Cell = { row: number; col: number };

// What occupies a tile
export type Tile =
  | 'floor'
  | 'wall'
  | 'fragment'  // collectible 'o'
  | 'hatch'     // exit '>'
  | 'player'    // current player position (overlays floor/fragment/hatch)
  | 'spectre';  // current spectre position (overlays floor)

// 7×7 grid: grid[row][col] is the base tile (not including actor overlays)
export type Grid = ReadonlyArray<ReadonlyArray<Tile>>;

// A Spectre's full patrol loop, expressed as an ordered list of cells the
// spectre visits in sequence, wrapping back to index 0 after the last step.
export type SpectreRoute = ReadonlyArray<Cell>;

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

// Everything needed to start and replay a level
export interface Level {
  grid: Grid;
  playerStart: Cell;
  fragmentCells: ReadonlyArray<Cell>;
  hatchCell: Cell;
  spectreRoutes: ReadonlyArray<SpectreRoute>; // length 2 or 3
  par: number;
}

// Live state during a run
export interface GameState {
  level: Level;
  playerPos: Cell;
  collectedFragments: number;              // count of fragments already picked up
  remainingFragments: ReadonlyArray<Cell>; // cells not yet collected
  spectreIndices: ReadonlyArray<number>;   // current route-index per spectre
  turns: number;
  silentRun: boolean; // false once player is within Chebyshev 2 of any spectre
  outcome: 'playing' | 'success' | 'failure_caught' | 'failure_timeout';
  moveHistory: ReadonlyArray<MoveDirection>;
}

// Outcome type narrowed for completed runs
export type RunOutcome = 'success' | 'failure_caught' | 'failure_timeout';

// Stored in localStorage per completed run
export interface StoredRun {
  utcDate: string; // 'YYYY-MM-DD'
  handle: string;
  outcome: RunOutcome;
  score: number;
  par: number;
  turns: number;
  moveHistory: ReadonlyArray<MoveDirection>;
}

// One entry in the top-10 Leaderboard
export interface LeaderboardEntry {
  handle: string;
  score: number;
  utcDate: string; // 'YYYY-MM-DD'
  par: number;
}
