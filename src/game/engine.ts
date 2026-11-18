import type {
  Cell,
  GameState,
  Level,
  MoveDirection,
  RunOutcome,
} from './types.js';

const GRID_SIZE = 7;

// Chebyshev distance between two cells
export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

// Build initial GameState from a Level
export function initGameState(level: Level): GameState {
  return {
    level,
    playerPos: level.playerStart,
    collectedFragments: 0,
    remainingFragments: level.fragmentCells.slice(),
    spectreIndices: level.spectreRoutes.map(() => 0),
    turns: 0,
    silentRun: true,
    outcome: 'playing',
    moveHistory: [],
  };
}

// Apply one player move; pure function
export function applyMove(state: GameState, dir: MoveDirection): GameState {
  // Guard: if already in a terminal state, return unchanged
  if (state.outcome !== 'playing') return state;

  const { level, playerPos } = state;

  // --- Step 1: Compute nextPos, block at walls/boundaries ---
  let nextRow = playerPos.row;
  let nextCol = playerPos.col;
  if (dir === 'up') nextRow -= 1;
  else if (dir === 'down') nextRow += 1;
  else if (dir === 'left') nextCol -= 1;
  else nextCol += 1;

  if (
    nextRow < 0 ||
    nextRow >= GRID_SIZE ||
    nextCol < 0 ||
    nextCol >= GRID_SIZE ||
    level.grid[nextRow][nextCol] === 'wall'
  ) {
    nextRow = playerPos.row;
    nextCol = playerPos.col;
  }

  const newPlayerPos: Cell = { row: nextRow, col: nextCol };

  // --- Step 2: Fragment collection ---
  let collectedFragments = state.collectedFragments;
  let remainingFragments = state.remainingFragments;

  const fragIdx = remainingFragments.findIndex(
    (f) => f.row === newPlayerPos.row && f.col === newPlayerPos.col
  );
  if (fragIdx !== -1) {
    collectedFragments += 1;
    remainingFragments = remainingFragments.filter((_, i) => i !== fragIdx);
  }

  // --- Step 3: Hatch success check (before spectre advance) ---
  if (
    collectedFragments === level.fragmentCells.length &&
    newPlayerPos.row === level.hatchCell.row &&
    newPlayerPos.col === level.hatchCell.col
  ) {
    return {
      ...state,
      playerPos: newPlayerPos,
      collectedFragments,
      remainingFragments,
      turns: state.turns + 1,   // count the winning move so turns == par on a perfect run
      outcome: 'success',
      moveHistory: [...state.moveHistory, dir],
    };
  }

  // --- Step 4: Advance spectres ---
  const newSpectreIndices = state.spectreIndices.map((idx, i) => {
    const route = level.spectreRoutes[i];
    return (idx + 1) % route.length;
  });

  // Current spectre positions after advance
  const spectrePositions = newSpectreIndices.map(
    (idx, i) => level.spectreRoutes[i][idx]
  );

  // --- Step 5: Caught check ---
  for (const sp of spectrePositions) {
    if (chebyshev(newPlayerPos, sp) <= 1) {
      return {
        ...state,
        playerPos: newPlayerPos,
        collectedFragments,
        remainingFragments,
        spectreIndices: newSpectreIndices,
        outcome: 'failure_caught',
        moveHistory: [...state.moveHistory, dir],
      };
    }
  }

  // --- Step 6: Silent-run update ---
  let silentRun = state.silentRun;
  for (const sp of spectrePositions) {
    if (chebyshev(newPlayerPos, sp) <= 2) {
      silentRun = false;
      break;
    }
  }

  // --- Step 7: Turn increment and timeout check ---
  const newTurns = state.turns + 1;
  if (newTurns >= 30) {
    return {
      ...state,
      playerPos: newPlayerPos,
      collectedFragments,
      remainingFragments,
      spectreIndices: newSpectreIndices,
      silentRun,
      turns: newTurns,
      outcome: 'failure_timeout',
      moveHistory: [...state.moveHistory, dir],
    };
  }

  // --- Step 8: Return updated state with outcome 'playing' ---
  return {
    ...state,
    playerPos: newPlayerPos,
    collectedFragments,
    remainingFragments,
    spectreIndices: newSpectreIndices,
    silentRun,
    turns: newTurns,
    outcome: 'playing',
    moveHistory: [...state.moveHistory, dir],
  };
}

// --- Scoring ---

export function computeScore(
  turns: number,
  par: number,
  silentRun: boolean,
  outcome: RunOutcome
): number {
  if (outcome !== 'success') return 0;

  const baseScore = Math.max(0, par * 10 - (turns - par) * 2);
  const parBonus = turns <= par ? 50 : 0;
  const silentBonus = silentRun ? 30 : 0;
  return baseScore + parBonus + silentBonus;
}

// --- Share text ---

export function generateShareText(
  level: Level,
  moveHistory: ReadonlyArray<MoveDirection>
): string {
  // Re-simulate movement from playerStart to build visited set V
  const visited = new Set<string>();
  let row = level.playerStart.row;
  let col = level.playerStart.col;
  visited.add(`${row},${col}`);

  for (const dir of moveHistory) {
    let nr = row;
    let nc = col;
    if (dir === 'up') nr -= 1;
    else if (dir === 'down') nr += 1;
    else if (dir === 'left') nc -= 1;
    else nc += 1;

    // Block at walls and boundaries (mirror applyMove behaviour)
    if (
      nr >= 0 &&
      nr < GRID_SIZE &&
      nc >= 0 &&
      nc < GRID_SIZE &&
      level.grid[nr][nc] !== 'wall'
    ) {
      row = nr;
      col = nc;
    }
    visited.add(`${row},${col}`);
  }

  const startKey = `${level.playerStart.row},${level.playerStart.col}`;
  const lines: string[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    let line = '';
    for (let c = 0; c < GRID_SIZE; c++) {
      const key = `${r},${c}`;
      if (key === startKey) {
        line += '▓'; // U+2593 player start
      } else if (visited.has(key)) {
        line += '█'; // U+2588 visited
      } else {
        line += '░'; // U+2591 unvisited
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}
