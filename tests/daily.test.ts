/**
 * Feature: ghostbbs — daily module tests
 *
 * Coverage:
 *  Property 1: Level determinism
 *  Property 2: Universal solvability (30-date window)
 *  Property 3: Par bounds 5 ≤ par ≤ 30
 *  Property 4: Grid structure (7×7, 3 fragments, 1 hatch, non-wall start)
 *  Req 3.8:    generateLevel(null) throws
 *  Req 3.9:    Fallback level is BFS-solvable
 *  Req 3.2:    Injected Date is sole clock source
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateLevel,
  FALLBACK_LEVEL,
  utcDateString,
  hash32,
  mulberry32,
  hasWinningLine,
} from '../src/game/daily.js';
import type { Level } from '../src/game/types.js';

// ---- Helper: BFS solvability (mirrors engine's check) ----

function isSolvable(level: Level): boolean {
  const GRID_SIZE = 7;
  const { grid, playerStart, fragmentCells, hatchCell } = level;
  const goalMask = (1 << fragmentCells.length) - 1;
  const fragIndex = new Map<string, number>();
  fragmentCells.forEach((c, i) => fragIndex.set(`${c.row},${c.col}`, i));

  const visited = new Uint8Array(GRID_SIZE * GRID_SIZE * 8);
  const idx = (r: number, c: number, m: number) => (r * GRID_SIZE + c) * 8 + m;

  const queue: Array<{ r: number; c: number; m: number }> = [];
  visited[idx(playerStart.row, playerStart.col, 0)] = 1;
  queue.push({ r: playerStart.row, c: playerStart.col, m: 0 });

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  let head = 0;

  while (head < queue.length) {
    const { r, c, m } = queue[head++];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (grid[nr][nc] === 'wall') continue;
      let nm = m;
      const bit = fragIndex.get(`${nr},${nc}`);
      if (bit !== undefined) nm |= 1 << bit;
      const si = idx(nr, nc, nm);
      if (visited[si]) continue;
      visited[si] = 1;
      if (nm === goalMask && nr === hatchCell.row && nc === hatchCell.col) return true;
      queue.push({ r: nr, c: nc, m: nm });
    }
  }
  return false;
}

// ---- date helpers ----

function dateFromString(s: string): Date {
  // Parse YYYY-MM-DD as UTC midnight
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days
  ));
}

// ---- Property 1: Level Determinism ----

describe('Level determinism (Property 1)', () => {
  it('generateLevel called twice with the same UTC date produces structurally identical levels', () => {
    // Feature: ghostbbs, Property 1: Level Determinism
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }).map((offset) =>
          addDays(dateFromString('2025-01-01'), offset)
        ),
        (date) => {
          const dateStr = utcDateString(date);
          const d1 = dateFromString(dateStr);
          const d2 = dateFromString(dateStr);
          const level1 = generateLevel(d1);
          const level2 = generateLevel(d2);

          expect(JSON.stringify(level1.grid)).toBe(JSON.stringify(level2.grid));
          expect(JSON.stringify(level1.fragmentCells)).toBe(JSON.stringify(level2.fragmentCells));
          expect(level1.hatchCell).toEqual(level2.hatchCell);
          expect(JSON.stringify(level1.spectreRoutes)).toBe(JSON.stringify(level2.spectreRoutes));
          expect(level1.playerStart).toEqual(level2.playerStart);
          expect(level1.par).toBe(level2.par);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Property 2: Universal solvability (30-date window) ----

describe('Universal solvability (Property 2)', () => {
  it('every level in a 30-consecutive-date window is BFS-solvable', () => {
    // Feature: ghostbbs, Property 2: Universal Solvability
    const start = dateFromString('2025-07-01');
    for (let i = 0; i < 30; i++) {
      const date = addDays(start, i);
      const level = generateLevel(date);
      expect(isSolvable(level)).toBe(true);
    }
  });
});

// ---- Property 3: Par bounds 5 ≤ par ≤ 30 ----

describe('Par bounds (Property 3)', () => {
  it('5 ≤ par ≤ 30 for all levels in a 30-date window', () => {
    // Feature: ghostbbs, Property 3: Par Bounds Invariant
    const start = dateFromString('2025-07-01');
    for (let i = 0; i < 30; i++) {
      const date = addDays(start, i);
      const level = generateLevel(date);
      expect(level.par).toBeGreaterThanOrEqual(5);
      expect(level.par).toBeLessThanOrEqual(30);
    }
  });

  it('par bounds hold over a property-based date range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }).map((offset) =>
          addDays(dateFromString('2025-01-01'), offset)
        ),
        (date) => {
          const level = generateLevel(date);
          expect(level.par).toBeGreaterThanOrEqual(5);
          expect(level.par).toBeLessThanOrEqual(30);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Property 4: Grid structure invariant ----

describe('Grid structure invariant (Property 4)', () => {
  it('every generated level is 7×7, has 3 fragments, 1 hatch, and non-wall playerStart', () => {
    // Feature: ghostbbs, Property 4: Grid Structure Invariant
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }).map((offset) =>
          addDays(dateFromString('2025-01-01'), offset)
        ),
        (date) => {
          const level = generateLevel(date);

          // Grid dimensions
          expect(level.grid.length).toBe(7);
          for (const row of level.grid) expect(row.length).toBe(7);

          // Fragment and hatch counts
          let frags = 0, hatches = 0;
          for (const row of level.grid) {
            for (const tile of row) {
              if (tile === 'fragment') frags++;
              if (tile === 'hatch') hatches++;
            }
          }
          expect(frags).toBe(3);
          expect(hatches).toBe(1);

          // playerStart is non-wall
          const { row, col } = level.playerStart;
          expect(level.grid[row][col]).not.toBe('wall');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Req 3.9: Fallback level is BFS-solvable ----

describe('Fallback level (Req 3.9)', () => {
  it('FALLBACK_LEVEL is BFS-solvable', () => {
    expect(isSolvable(FALLBACK_LEVEL)).toBe(true);
  });

  it('FALLBACK_LEVEL.par matches BFS output', () => {
    // Verify the hard-coded par by running our BFS helper from the test side.
    // We re-implement a step-counting BFS here to avoid importing daily internals.
    const { grid, playerStart, fragmentCells, hatchCell } = FALLBACK_LEVEL;
    const GRID_SIZE = 7;
    const goalMask = (1 << fragmentCells.length) - 1;
    const fragIndex = new Map<string, number>();
    fragmentCells.forEach((c, i) => fragIndex.set(`${c.row},${c.col}`, i));

    const visited = new Uint8Array(GRID_SIZE * GRID_SIZE * 8);
    const idx = (r: number, c: number, m: number) => (r * GRID_SIZE + c) * 8 + m;
    const queue: Array<{ r: number; c: number; m: number; steps: number }> = [];

    visited[idx(playerStart.row, playerStart.col, 0)] = 1;
    queue.push({ r: playerStart.row, c: playerStart.col, m: 0, steps: 0 });

    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    let bfsPar = -1;
    let head = 0;

    while (head < queue.length) {
      const { r, c, m, steps } = queue[head++];
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (grid[nr][nc] === 'wall') continue;
        let nm = m;
        const bit = fragIndex.get(`${nr},${nc}`);
        if (bit !== undefined) nm |= 1 << bit;
        const si = idx(nr, nc, nm);
        if (visited[si]) continue;
        visited[si] = 1;
        if (nm === goalMask && nr === hatchCell.row && nc === hatchCell.col) {
          bfsPar = steps + 1;
          head = queue.length; // break
          break;
        }
        queue.push({ r: nr, c: nc, m: nm, steps: steps + 1 });
      }
      if (bfsPar !== -1) break;
    }

    expect(bfsPar).toBe(FALLBACK_LEVEL.par);
  });
});

// ---- Req 3.8: generateLevel(null) throws ----

describe('Opening move is survivable (regression)', () => {
  it('no spectre starts adjacent to the player', () => {
    for (let day = 0; day < 45; day++) {
      const date = new Date(Date.UTC(2026, 10, 1 + day));
      const level = generateLevel(date);
      for (const route of level.spectreRoutes) {
        const spectre = route[0];
        const distance = Math.max(
          Math.abs(spectre.row - level.playerStart.row),
          Math.abs(spectre.col - level.playerStart.col)
        );
        expect(distance).toBeGreaterThan(1);
      }
    }
  });
});

describe('Daily level is survivable, not just solvable (regression)', () => {
  it('every generated level has a winning line that survives the patrols', () => {
    for (let day = 0; day < 45; day++) {
      const date = new Date(Date.UTC(2026, 10, 1 + day));
      expect(hasWinningLine(generateLevel(date))).toBe(true);
    }
  });

  it('rejects a level whose patrol camps the hatch', () => {
    // 2026-11-18 shipped without the survivability guard: a patrol sat on the
    // hatch corner, so collecting the last fragment was always fatal.
    const grid = Array.from({ length: 7 }, () =>
      Array.from<'floor' | 'wall' | 'fragment' | 'hatch'>({ length: 7 }).fill('floor')
    );
    grid[0][2] = 'fragment';
    grid[2][0] = 'fragment';
    grid[4][4] = 'fragment';
    grid[6][6] = 'hatch';
    const trapped = {
      grid: grid as Level['grid'],
      playerStart: { row: 0, col: 0 },
      fragmentCells: [
        { row: 0, col: 2 },
        { row: 2, col: 0 },
        { row: 4, col: 4 },
      ],
      hatchCell: { row: 6, col: 6 },
      spectreRoutes: [
        [{ row: 6, col: 5 }, { row: 6, col: 6 }],
      ],
    };
    expect(hasWinningLine(trapped)).toBe(false);
    expect(hasWinningLine(FALLBACK_LEVEL)).toBe(true);
  });
});

describe('Invalid date (Req 3.8)', () => {
  it('generateLevel(null) throws an error', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => generateLevel(null as any)).toThrow('generateLevel: invalid date');
  });
});

// ---- Req 3.2: Injected Date is sole clock source ----

describe('Injected Date is sole clock source (Req 3.2)', () => {
  it('different UTC dates produce different grids', () => {
    const d1 = dateFromString('2025-07-01');
    const d2 = dateFromString('2025-07-02');
    const level1 = generateLevel(d1);
    const level2 = generateLevel(d2);
    // Grids must differ (they will, since the seed differs)
    expect(JSON.stringify(level1.grid)).not.toBe(JSON.stringify(level2.grid));
  });

  it('utcDateString is deterministic', () => {
    const date = new Date(Date.UTC(2025, 6, 14)); // 2025-07-14
    expect(utcDateString(date)).toBe('2025-07-14');
  });

  it('hash32 is deterministic', () => {
    expect(hash32('ghostbbs:2025-07-14')).toBe(hash32('ghostbbs:2025-07-14'));
    expect(hash32('ghostbbs:2025-07-14')).not.toBe(hash32('ghostbbs:2025-07-15'));
  });

  it('mulberry32 is deterministic', () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });
});
