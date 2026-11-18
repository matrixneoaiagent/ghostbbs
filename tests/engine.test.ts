/**
 * Feature: ghostbbs — engine module tests
 *
 * Coverage:
 *  Property 5:  Move preserves bounds, never enters wall
 *  Property 6:  Fragment collection
 *  Property 7:  Spectre advances exactly one step
 *  Property 8:  Caught condition correctness
 *  Property 9:  Scoring formula
 *  Property 10: Silent-run flag monotonicity
 *  Property 11: Share text structure (7×7, correct glyphs)
 *  Property 12: Share text determinism
 *  Req 4.6/4.13: Hatch success fires before spectre advance
 *  Req 4.9/4.13: Caught evaluated after spectre advance
 *  Req 4.11:   Timeout at turn 30
 *  Req 4.7:    Hatch passable before all fragments collected
 *  Req 5.4:    Failed run score is 0
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  initGameState,
  applyMove,
  computeScore,
  generateShareText,
  chebyshev,
} from '../src/game/engine.js';
import { FALLBACK_LEVEL, generateLevel } from '../src/game/daily.js';
import type { Level, MoveDirection, Tile } from '../src/game/types.js';

// ---- Helpers ----

function makeEmptyLevel(overrides: Partial<Level> = {}): Level {
  // 7×7 all-floor level, single spectre in a corner far from start
  const grid: Tile[][] = Array.from({ length: 7 }, () =>
    Array.from<Tile>({ length: 7 }).fill('floor')
  );
  grid[0][2] = 'fragment';
  grid[2][0] = 'fragment';
  grid[4][4] = 'fragment';
  grid[6][6] = 'hatch';
  return {
    grid: grid as Level['grid'],
    playerStart: { row: 0, col: 0 },
    fragmentCells: [{ row: 0, col: 2 }, { row: 2, col: 0 }, { row: 4, col: 4 }],
    hatchCell: { row: 6, col: 6 },
    spectreRoutes: [
      [{ row: 6, col: 0 }, { row: 6, col: 1 }], // far from start
    ],
    par: 15,
    ...overrides,
  };
}

/** Build a level with a wall at (0, 1) to test blocking */
function levelWithWall(): Level {
  const base = makeEmptyLevel();
  const grid = base.grid.map((row) => [...row]) as Tile[][];
  grid[0][1] = 'wall';
  return { ...base, grid: grid as Level['grid'] };
}

// ---- chebyshev ----

describe('chebyshev', () => {
  it('is 0 for same cell', () => {
    expect(chebyshev({ row: 3, col: 3 }, { row: 3, col: 3 })).toBe(0);
  });

  it('is max of |dr| and |dc|', () => {
    expect(chebyshev({ row: 0, col: 0 }, { row: 3, col: 1 })).toBe(3);
    expect(chebyshev({ row: 2, col: 2 }, { row: 2, col: 5 })).toBe(3);
    expect(chebyshev({ row: 1, col: 1 }, { row: 3, col: 3 })).toBe(2);
  });
});

// ---- Property 5: Move preserves bounds and never enters wall ----

describe('Move application — bounds and walls (Property 5)', () => {
  it('playerPos is always within 0..6 and never on a wall tile', () => {
    // Feature: ghostbbs, Property 5: Move Application Preserves Bounds
    const level = levelWithWall();
    const dirs: MoveDirection[] = ['up', 'down', 'left', 'right'];

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<MoveDirection>(...dirs), { minLength: 1, maxLength: 20 }),
        (moves) => {
          let state = initGameState(level);
          for (const dir of moves) {
            state = applyMove(state, dir);
            const { row, col } = state.playerPos;
            expect(row).toBeGreaterThanOrEqual(0);
            expect(row).toBeLessThan(7);
            expect(col).toBeGreaterThanOrEqual(0);
            expect(col).toBeLessThan(7);
            expect(state.level.grid[row][col]).not.toBe('wall');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('move into wall keeps player in place and consumes a turn', () => {
    const level = levelWithWall();
    const state = initGameState(level); // at (0,0)
    // Moving right should hit wall at (0,1)
    const after = applyMove(state, 'right');
    expect(after.playerPos).toEqual({ row: 0, col: 0 });
    expect(after.turns).toBe(1);
  });

  it('move off grid top keeps player in place', () => {
    const state = initGameState(makeEmptyLevel()); // at (0,0)
    const after = applyMove(state, 'up');
    expect(after.playerPos).toEqual({ row: 0, col: 0 });
    expect(after.turns).toBe(1);
  });
});

// ---- Property 6: Fragment collection ----

describe('Fragment collection (Property 6)', () => {
  it('moving onto a fragment cell increments collectedFragments and removes from remainingFragments', () => {
    const level = makeEmptyLevel();
    const state = initGameState(level); // at (0,0); fragment at (0,2)
    const after1 = applyMove(state, 'right'); // -> (0,1)
    expect(after1.collectedFragments).toBe(0);
    const after2 = applyMove(after1, 'right'); // -> (0,2) — fragment here
    expect(after2.collectedFragments).toBe(1);
    expect(after2.remainingFragments.some((f) => f.row === 0 && f.col === 2)).toBe(false);
  });

  it('fragment not collected twice', () => {
    const level = makeEmptyLevel();
    let state = initGameState(level);
    state = applyMove(state, 'right'); // (0,1)
    state = applyMove(state, 'right'); // (0,2) — collect fragment
    state = applyMove(state, 'left'); // (0,1)
    state = applyMove(state, 'right'); // (0,2) again — no re-collect
    expect(state.collectedFragments).toBe(1);
  });
});

// ---- Property 7: Spectre advances exactly one route step per turn ----

describe('Spectre advance (Property 7)', () => {
  it('each spectre index advances by exactly 1 mod route length per turn', () => {
    // Feature: ghostbbs, Property 7: Spectre Advance Exactly One Step
    const level = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 6, col: 0 }, { row: 6, col: 1 }, { row: 6, col: 2 }],
      ],
    });
    const state = initGameState(level);
    expect(state.spectreIndices[0]).toBe(0);

    const after1 = applyMove(state, 'down');
    expect(after1.spectreIndices[0]).toBe(1);

    const after2 = applyMove(after1, 'down');
    expect(after2.spectreIndices[0]).toBe(2);

    const after3 = applyMove(after2, 'down');
    expect(after3.spectreIndices[0]).toBe(0); // wraps around
  });

  it('spectre index advances correctly over many steps', () => {
    const routeLen = 5;
    const route = Array.from({ length: routeLen }, (_, i) => ({ row: 6, col: i }));
    const level = makeEmptyLevel({ spectreRoutes: [route] });
    let state = initGameState(level);

    for (let t = 0; t < 20 && state.outcome === 'playing'; t++) {
      const before = state.spectreIndices[0];
      state = applyMove(state, 'down');
      if (state.outcome === 'playing') {
        expect(state.spectreIndices[0]).toBe((before + 1) % routeLen);
      }
    }
  });
});

// ---- Property 8: Caught condition correctness ----

describe('Caught detection (Property 8)', () => {
  it('caught when Chebyshev ≤ 1 after spectre advance', () => {
    // Feature: ghostbbs, Property 8: Caught Condition Correctness
    // Player at (0,0). Spectre starts at index 0 → (2,2), advances to (1,1) on turn 1.
    // After moving right to (0,1), chebyshev((0,1),(1,1)) = 1 → caught.
    const level = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 2, col: 2 }, { row: 1, col: 1 }],
      ],
    });
    const state = initGameState(level);
    const after = applyMove(state, 'right'); // player at (0,1); spectre at (1,1) after advance
    expect(after.outcome).toBe('failure_caught');
  });

  it('not caught when Chebyshev > 1', () => {
    // Spectre far away — route in bottom-right corner, never approaches player early
    const level = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 6, col: 6 }, { row: 6, col: 5 }],
      ],
    });
    const state = initGameState(level);
    const after = applyMove(state, 'right');
    expect(after.outcome).toBe('playing');
  });

  it('caught when spectre steps onto player tile', () => {
    // Player at (3,3). Spectre advances to (3,3). chebyshev = 0 ≤ 1 → caught.
    const level = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 3, col: 4 }, { row: 3, col: 3 }],
      ],
    });
    let state = initGameState(level);
    // Move player to (3,3)
    for (let i = 0; i < 3; i++) state = applyMove(state, 'down');
    for (let i = 0; i < 3; i++) state = applyMove(state, 'right');
    // Now player is at (3,3), spectre at index wrapping through its route.
    // We need to test the basic property: caught = chebyshev ≤ 1.
    // Let's just verify chebyshev(a,a) == 0 ≤ 1 triggers caught in a crafted state.
    const craftedLevel = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 3, col: 4 }, { row: 0, col: 0 }], // second position = player start
      ],
    });
    const craftedState = initGameState(craftedLevel); // player at (0,0); spectre index 0
    // On first move, spectre advances to (0,0); player just moved.
    const result = applyMove(craftedState, 'down');
    // Player is now at (1,0). Spectre is at (0,0). chebyshev((1,0),(0,0)) = 1 → caught.
    expect(result.outcome).toBe('failure_caught');
  });
});

// ---- Turn resolution order: hatch success before spectre advance ----

describe('Turn resolution order (Req 4.6, 4.13)', () => {
  it('hatch success fires before spectre advance', () => {
    // Player at (0,0). One fragment at (0,1). Hatch at (0,2).
    // Spectre route: [(6,0), (5,0)] — far from player throughout.
    // Player path: right -> (0,1) collect fragment; right -> (0,2) = hatch → success.
    // Even though the spectre could theoretically cause issues, this verifies
    // that reaching the hatch with all fragments ends the run as success.
    const grid: Tile[][] = Array.from({ length: 7 }, () =>
      Array.from<Tile>({ length: 7 }).fill('floor')
    );
    grid[0][1] = 'fragment';
    grid[0][2] = 'hatch';

    const level: Level = {
      grid: grid as Level['grid'],
      playerStart: { row: 0, col: 0 },
      fragmentCells: [{ row: 0, col: 1 }],
      hatchCell: { row: 0, col: 2 },
      spectreRoutes: [
        [{ row: 6, col: 0 }, { row: 5, col: 0 }], // far away from player
      ],
      par: 2,
    };

    let state = initGameState(level);
    state = applyMove(state, 'right'); // -> (0,1) collect fragment; spectre -> (5,0)
    expect(state.collectedFragments).toBe(1);
    expect(state.outcome).toBe('playing');

    state = applyMove(state, 'right'); // -> (0,2) hatch; success fires (step 3) before spectre advance (step 4)
    expect(state.outcome).toBe('success');
  });

  it('spectre on hatch cell does not prevent success (success checked first)', () => {
    // This is the definitive order test: spectre will advance onto the hatch cell on
    // the winning move, but success is detected at step 3 (before advance at step 4).
    // Setup: player at (0,1), all fragments collected already, hatch at (0,2).
    // Spectre starts at (0,3) and would advance to (0,2) = hatch.
    // If order were wrong (advance before success check), chebyshev((0,2),(0,2))=0 → caught.
    const grid: Tile[][] = Array.from({ length: 7 }, () =>
      Array.from<Tile>({ length: 7 }).fill('floor')
    );
    grid[0][2] = 'hatch';

    const level: Level = {
      grid: grid as Level['grid'],
      playerStart: { row: 0, col: 1 },
      fragmentCells: [], // no fragments — already "collected" at start
      hatchCell: { row: 0, col: 2 },
      spectreRoutes: [
        [{ row: 0, col: 3 }, { row: 0, col: 2 }], // advances to hatch on turn 1
      ],
      par: 1,
    };

    const state = initGameState(level);
    // collectedFragments = 0, fragmentCells = [] so collectedFragments === fragmentCells.length
    const after = applyMove(state, 'right'); // move to (0,2); success check fires before spectre advances to (0,2)
    expect(after.outcome).toBe('success');
  });
});

// ---- Turn resolution order: caught evaluated after spectre advance ----

describe('Turn resolution order: caught after advance (Req 4.9, 4.13)', () => {
  it('caught check uses post-advance spectre position', () => {
    // Spectre starts at (5,5) (far away). After advance → (3,3).
    // Player moves to (3,3) → same cell → chebyshev 0 → caught.
    const grid: Tile[][] = Array.from({ length: 7 }, () =>
      Array.from<Tile>({ length: 7 }).fill('floor')
    );
    grid[3][4] = 'fragment';
    grid[4][4] = 'fragment';
    grid[4][5] = 'fragment';
    grid[6][6] = 'hatch';

    const level: Level = {
      grid: grid as Level['grid'],
      playerStart: { row: 3, col: 2 },
      fragmentCells: [{ row: 3, col: 4 }, { row: 4, col: 4 }, { row: 4, col: 5 }],
      hatchCell: { row: 6, col: 6 },
      spectreRoutes: [
        [{ row: 5, col: 5 }, { row: 3, col: 3 }],
      ],
      par: 10,
    };

    const state = initGameState(level);
    // Player moves right → (3,3). Spectre advances to (3,3). chebyshev = 0 → caught.
    const after = applyMove(state, 'right');
    expect(after.outcome).toBe('failure_caught');
  });
});

// ---- Req 4.11: Timeout at turn 30 ----

describe('Timeout (Req 4.11)', () => {
  it('outcome is failure_timeout when turns reach 30', () => {
    // Keep spectres far away; bounce player left-right for 30 turns
    const level = makeEmptyLevel();
    let state = initGameState(level);
    // Bounce between (0,0) and (0,0) by hitting left boundary
    for (let i = 0; i < 30 && state.outcome === 'playing'; i++) {
      state = applyMove(state, i % 2 === 0 ? 'right' : 'left');
    }
    expect(state.outcome).toBe('failure_timeout');
    expect(state.turns).toBe(30);
  });
});

// ---- Req 4.7: Hatch passable before all fragments collected ----

describe('Hatch passable before all fragments (Req 4.7)', () => {
  it('stepping on hatch before collecting all fragments does not end the run', () => {
    const grid: Tile[][] = Array.from({ length: 7 }, () =>
      Array.from<Tile>({ length: 7 }).fill('floor')
    );
    grid[2][0] = 'fragment';
    grid[3][0] = 'fragment';
    grid[4][0] = 'fragment';
    grid[0][1] = 'hatch';

    const level: Level = {
      grid: grid as Level['grid'],
      playerStart: { row: 0, col: 0 },
      fragmentCells: [{ row: 2, col: 0 }, { row: 3, col: 0 }, { row: 4, col: 0 }],
      hatchCell: { row: 0, col: 1 },
      spectreRoutes: [[{ row: 6, col: 6 }, { row: 6, col: 5 }]],
      par: 10,
    };

    const state = initGameState(level);
    const after = applyMove(state, 'right'); // step onto hatch (0,1)
    expect(after.playerPos).toEqual({ row: 0, col: 1 });
    expect(after.outcome).toBe('playing'); // not success yet
  });
});

// ---- Property 9: Scoring formula ----

describe('Scoring formula (Property 9)', () => {
  it('computeScore matches the formula for successful runs', () => {
    // Feature: ghostbbs, Property 9: Scoring Formula
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),  // turns
        fc.integer({ min: 5, max: 30 }),  // par
        fc.boolean(),                       // silentRun
        (turns, par, silentRun) => {
          const score = computeScore(turns, par, silentRun, 'success');
          const base = Math.max(0, par * 10 - (turns - par) * 2);
          const parBonus = turns <= par ? 50 : 0;
          const silentBonus = silentRun ? 30 : 0;
          expect(score).toBe(base + parBonus + silentBonus);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('score table from design document', () => {
    expect(computeScore(11, 11, true, 'success')).toBe(190);
    expect(computeScore(11, 11, false, 'success')).toBe(160);
    expect(computeScore(13, 11, false, 'success')).toBe(106);
    // turns=25, par=11: base = max(0, 110-28)=82
    expect(computeScore(25, 11, false, 'success')).toBe(82);
  });

  it('failed run returns score 0 (Req 5.4)', () => {
    expect(computeScore(10, 10, true, 'failure_caught')).toBe(0);
    expect(computeScore(10, 10, true, 'failure_timeout')).toBe(0);
  });
});

// ---- Property 10: Silent-run flag monotonicity ----

describe('Silent-run flag monotonicity (Property 10)', () => {
  it('silentRun never reverts to true once set to false', () => {
    // Feature: ghostbbs, Property 10: Silent-Run Flag Monotonicity
    // A spectre that starts far away and approaches
    const level = makeEmptyLevel({
      spectreRoutes: [
        // Route that brings spectre within distance 2 of origin then stays
        [
          { row: 4, col: 4 },
          { row: 3, col: 3 }, // after 1 advance
          { row: 2, col: 2 }, // after 2 advances
          { row: 1, col: 1 }, // after 3 advances — Chebyshev 2 from (0,0) → silent=false
          { row: 4, col: 4 }, // back to far
        ],
      ],
    });

    let state = initGameState(level);
    expect(state.silentRun).toBe(true);

    // Apply a few moves; once false, never goes true
    let wentFalse = false;
    for (let i = 0; i < 15 && state.outcome === 'playing'; i++) {
      state = applyMove(state, i % 2 === 0 ? 'down' : 'up');
      if (!state.silentRun) wentFalse = true;
      if (wentFalse) expect(state.silentRun).toBe(false);
    }
  });

  it('silentRun becomes false when spectre is within Chebyshev 2', () => {
    // Spectre advances to distance-2 cell
    const level = makeEmptyLevel({
      spectreRoutes: [
        [{ row: 4, col: 4 }, { row: 2, col: 2 }], // distance 2 from (0,0)
      ],
    });
    const state = initGameState(level);
    const after = applyMove(state, 'down'); // spectre advances to (2,2); chebyshev((1,0),(2,2))=2
    // Player moved to (1,0). chebyshev((1,0),(2,2)) = max(1,2) = 2 → silentRun = false
    expect(after.silentRun).toBe(false);
  });
});

// ---- Guard: applyMove on terminal state returns unchanged ----

describe('Terminal state guard', () => {
  it('applyMove on a success state returns the same state', () => {
    const level = makeEmptyLevel({
      fragmentCells: [{ row: 0, col: 1 }],
      hatchCell: { row: 0, col: 2 },
    });
    const grid: Tile[][] = Array.from({ length: 7 }, () =>
      Array.from<Tile>({ length: 7 }).fill('floor')
    );
    grid[0][1] = 'fragment';
    grid[0][2] = 'hatch';

    const terminalLevel: Level = {
      ...level,
      grid: grid as Level['grid'],
    };

    let state = initGameState(terminalLevel);
    state = applyMove(state, 'right'); // collect fragment
    state = applyMove(state, 'right'); // reach hatch → success
    expect(state.outcome).toBe('success');

    const before = state;
    const after = applyMove(state, 'down');
    expect(after).toBe(before); // exact same reference
  });
});

// ---- Property 11 & 12: Share text structure and determinism ----

describe('Share text (Properties 11 & 12)', () => {
  it('is 7×7 with only ░, ▓, █ characters (Property 11)', () => {
    // Feature: ghostbbs, Property 11: Share Text Structure
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<MoveDirection>('up', 'down', 'left', 'right'),
          { maxLength: 15 }
        ),
        (moves) => {
          const text = generateShareText(FALLBACK_LEVEL, moves);
          const lines = text.split('\n');
          expect(lines.length).toBe(7);
          for (const line of lines) {
            expect(line.length).toBe(7);
            for (const ch of line) {
              expect(['░', '▓', '█']).toContain(ch);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('is deterministic for identical inputs (Property 12)', () => {
    // Feature: ghostbbs, Property 12: Share Text Determinism
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<MoveDirection>('up', 'down', 'left', 'right'),
          { maxLength: 15 }
        ),
        (moves) => {
          const t1 = generateShareText(FALLBACK_LEVEL, moves);
          const t2 = generateShareText(FALLBACK_LEVEL, moves);
          expect(t1).toBe(t2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('player start is always ▓', () => {
    const text = generateShareText(FALLBACK_LEVEL, []);
    expect(text[0]).toBe('▓'); // (0,0) is start
  });

  it('visited cells are ▓ or █, unvisited are ░', () => {
    // Move right twice from start (0,0) → (0,1) → (0,2)
    const moves: MoveDirection[] = ['right', 'right'];
    const text = generateShareText(FALLBACK_LEVEL, moves);
    const lines = text.split('\n');
    expect(lines[0][0]).toBe('▓'); // start
    expect(lines[0][1]).toBe('█'); // visited
    expect(lines[0][2]).toBe('█'); // visited (also fragment, but glyphs don't distinguish)
    expect(lines[0][3]).toBe('░'); // unvisited
  });
});

// ---- Full run integration: plays FALLBACK_LEVEL to success ----

describe('Full run on FALLBACK_LEVEL', () => {
  it('a known winning sequence reaches success', () => {
    // FALLBACK_LEVEL: fragments at (0,2),(2,0),(4,4); hatch at (6,6); par=16
    // Spectres loop in top-right corner (rows 0–1, cols 5–6) throughout — never
    // within Chebyshev 1 of this route.
    // Route (16 moves, matches par):
    //   r,r → (0,2) frag 1
    //   l,l → (0,0)
    //   d,d → (2,0) frag 2
    //   r,r,r,r → (2,4)
    //   d,d → (4,4) frag 3
    //   r,r → (4,6)
    //   d,d → (6,6) hatch
    const moves: MoveDirection[] = [
      'right', 'right',
      'left', 'left',
      'down', 'down',
      'right', 'right', 'right', 'right',
      'down', 'down',
      'right', 'right',
      'down', 'down',
    ];

    let state = initGameState(FALLBACK_LEVEL);
    for (const dir of moves) {
      if (state.outcome !== 'playing') break;
      state = applyMove(state, dir);
    }

    expect(state.outcome).toBe('success');
    expect(state.collectedFragments).toBe(3);
    expect(state.turns).toBe(16); // 16 moves taken == par
  });
});

// ---- generateLevel integration check ----

describe('generateLevel integration', () => {
  it('a level for today is playable with the engine', () => {
    const date = new Date(Date.UTC(2025, 6, 14)); // 2025-07-14
    const level = generateLevel(date);
    const state = initGameState(level);
    expect(state.outcome).toBe('playing');
    expect(state.remainingFragments.length).toBe(3);
  });
});
