/**
 * Feature: ghostbbs — storage module tests
 *
 * Coverage:
 *  Property 13: StoredRun round-trip
 *  Property 14: Leaderboard size ≤ 10
 *  Property 15: Leaderboard sorted by score descending
 *  Req 6.2:     One-run-per-day
 *  Req 8.1:     Same handle+date replacement rules
 *  Req 8.5:     Storage unavailable → safe defaults
 *  Req 14.2:    All keys under ghostbbs:v1:
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { StoredRun, LeaderboardEntry } from '../src/game/types.js';

// ---- localStorage mock ----
// vitest runs in Node, which has no localStorage. We provide a simple
// in-memory replacement that can also be made to throw.

let _store: Map<string, string>;
let _shouldThrow = false;

const mockStorage = {
  getItem(key: string): string | null {
    if (_shouldThrow) throw new Error('storage unavailable');
    return _store.has(key) ? (_store.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    if (_shouldThrow) throw new Error('storage unavailable');
    _store.set(key, value);
  },
  removeItem(key: string): void {
    if (_shouldThrow) throw new Error('storage unavailable');
    _store.delete(key);
  },
  clear(): void {
    _store.clear();
  },
  get length() {
    return _store.size;
  },
  key(index: number): string | null {
    return [..._store.keys()][index] ?? null;
  },
};

// Inject mock before importing storage (which references globalThis.localStorage)
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

// Now import storage (after mock is in place)
const {
  readHandle,
  writeHandle,
  readRun,
  writeRun,
  readScores,
  writeScores,
} = await import('../src/game/storage.js');

// ---- helpers ----

function makeRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    utcDate: '2025-07-14',
    handle: 'GHOST',
    outcome: 'success',
    score: 100,
    par: 11,
    turns: 11,
    moveHistory: ['right', 'down'],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    handle: 'GHOST',
    score: 100,
    utcDate: '2025-07-14',
    par: 11,
    ...overrides,
  };
}

beforeEach(() => {
  _store = new Map();
  _shouldThrow = false;
});

afterEach(() => {
  _shouldThrow = false;
});

// ---- Property 13: StoredRun round-trip ----

describe('StoredRun round-trip (Property 13)', () => {
  it('writeRun then readRun returns a deeply equal value', () => {
    // Feature: ghostbbs, Property 13: StoredRun Round-Trip
    fc.assert(
      fc.property(
        fc.record({
          utcDate: fc.constantFrom('2025-01-01', '2025-07-14', '2025-12-31'),
          handle: fc.string({ minLength: 1, maxLength: 20 }),
          outcome: fc.constantFrom<'success' | 'failure_caught' | 'failure_timeout'>(
            'success', 'failure_caught', 'failure_timeout'
          ),
          score: fc.integer({ min: 0, max: 500 }),
          par: fc.integer({ min: 5, max: 30 }),
          turns: fc.integer({ min: 1, max: 30 }),
          moveHistory: fc.array(
            fc.constantFrom<'up' | 'down' | 'left' | 'right'>('up', 'down', 'left', 'right'),
            { maxLength: 30 }
          ),
        }),
        (run) => {
          _store.clear();
          writeRun(run);
          const retrieved = readRun(run.utcDate, run.handle);
          expect(retrieved).toEqual(run);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Req 6.2: One-run-per-day ----

describe('One-run-per-day (Req 6.2)', () => {
  it('a second writeRun for the same date+handle does not change the stored result when the new score is not strictly greater', () => {
    const first = makeRun({ score: 100 });
    writeRun(first);

    const sameScore = makeRun({ score: 100, turns: 15 });
    writeRun(sameScore);
    expect(readRun('2025-07-14', 'GHOST')).toEqual(first);

    const lowerScore = makeRun({ score: 50 });
    writeRun(lowerScore);
    expect(readRun('2025-07-14', 'GHOST')).toEqual(first);
  });

  it('a second writeRun with strictly higher score replaces the existing entry', () => {
    const first = makeRun({ score: 100 });
    writeRun(first);

    const better = makeRun({ score: 150 });
    writeRun(better);
    expect(readRun('2025-07-14', 'GHOST')?.score).toBe(150);
  });
});

// ---- Property 14: Leaderboard size ≤ 10 ----

describe('Leaderboard size invariant (Property 14)', () => {
  it('never exceeds 10 entries after repeated inserts with score > 0', () => {
    // Feature: ghostbbs, Property 14: Leaderboard Size Invariant
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            handle: fc.string({ minLength: 1, maxLength: 10 }),
            utcDate: fc.constantFrom(
              '2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01',
              '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01',
              '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01'
            ),
            score: fc.integer({ min: 1, max: 500 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (inputs) => {
          _store.clear();
          for (const input of inputs) {
            writeRun(makeRun({ ...input, outcome: 'success' }));
          }
          expect(readScores().length).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Property 15: Leaderboard sorted by score descending ----

describe('Leaderboard sort order (Property 15)', () => {
  it('readScores returns entries sorted by score descending', () => {
    // Feature: ghostbbs, Property 15: Leaderboard Sort Order
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            handle: fc.string({ minLength: 1, maxLength: 10 }),
            utcDate: fc.constantFrom(
              '2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01',
              '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01'
            ),
            score: fc.integer({ min: 1, max: 500 }),
          }),
          { minLength: 2, maxLength: 15 }
        ),
        (inputs) => {
          _store.clear();
          for (const input of inputs) {
            writeRun(makeRun({ ...input, outcome: 'success' }));
          }
          const scores = readScores();
          for (let i = 1; i < scores.length; i++) {
            expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Req 8.1: Leaderboard same handle+date replacement ----

describe('Leaderboard replacement rules (Req 8.1)', () => {
  it('replaces entry for same handle+date when new score is strictly greater', () => {
    writeRun(makeRun({ score: 100 }));
    writeRun(makeRun({ score: 150 }));
    const scores = readScores();
    expect(scores.filter((e) => e.handle === 'GHOST' && e.utcDate === '2025-07-14').length).toBe(1);
    expect(scores.find((e) => e.handle === 'GHOST')?.score).toBe(150);
  });

  it('does not replace entry for same handle+date when new score is equal', () => {
    writeRun(makeRun({ score: 100 }));
    writeRun(makeRun({ score: 100, turns: 20 }));
    const scores = readScores();
    expect(scores.filter((e) => e.handle === 'GHOST').length).toBe(1);
  });

  it('does not replace entry for same handle+date when new score is lower', () => {
    writeRun(makeRun({ score: 100 }));
    writeRun(makeRun({ score: 50 }));
    const scores = readScores();
    expect(scores.find((e) => e.handle === 'GHOST')?.score).toBe(100);
  });
});

// ---- Req 8.5: Storage unavailable ----

describe('Storage unavailable (Req 8.5)', () => {
  it('readHandle returns null when localStorage throws', () => {
    _shouldThrow = true;
    expect(readHandle()).toBeNull();
  });

  it('readRun returns null when localStorage throws', () => {
    _shouldThrow = true;
    expect(readRun('2025-07-14', 'GHOST')).toBeNull();
  });

  it('readScores returns [] when localStorage throws', () => {
    _shouldThrow = true;
    expect(readScores()).toEqual([]);
  });

  it('writeHandle is a silent no-op when localStorage throws', () => {
    _shouldThrow = true;
    expect(() => writeHandle('GHOST')).not.toThrow();
  });

  it('writeRun is a silent no-op when localStorage throws', () => {
    _shouldThrow = true;
    expect(() => writeRun(makeRun())).not.toThrow();
  });

  it('writeScores is a silent no-op when localStorage throws', () => {
    _shouldThrow = true;
    expect(() => writeScores([makeEntry()])).not.toThrow();
  });
});

// ---- Req 14.2: All keys under ghostbbs:v1: ----

describe('Key namespace (Req 14.2)', () => {
  it('all written keys begin with ghostbbs:v1:', () => {
    writeHandle('GHOST');
    writeRun(makeRun());
    writeScores([makeEntry()]);

    for (const key of _store.keys()) {
      expect(key).toMatch(/^ghostbbs:v1:/);
    }
  });
});
