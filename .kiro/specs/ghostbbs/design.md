# Design Document: GHOSTBBS

## Overview

GHOSTBBS is a static browser SPA — no backend, no network calls at runtime. Its sole interactive feature is SPECTRE SWEEP, a daily door game on a seeded 7×7 grid. The design is intentionally minimal: roughly 15 source files, one CSS file, and a pure TypeScript game engine that runs equally well in a browser and in Node/Vitest.

The architecture divides cleanly into two layers:

- **`src/game/`** — pure TypeScript. Zero DOM imports. All game rules, level generation, scoring, storage access, and share-text encoding live here.
- **`src/ui/`** — React 19 components. Renders state from the engine; dispatches moves back to it. Contains no game logic.

---

## Architecture

```
src/
  main.tsx              React root; mounts <App />
  ui/
    App.tsx             Screen state machine (enum + transitions)
    Boot.tsx            Modem-handshake animation + skip/reduced-motion
    Menu.tsx            Main menu, About, Message Board
    DoorGame.tsx        Keyboard/D-pad input; delegates moves to engine
    Board.tsx           Renders Grid cells + HUD (turns, fragments)
    ResultCard.tsx      Score, Share_Text, clipboard copy, Leaderboard
    styles.css          Single stylesheet — CSS variables, box-drawing frames
  game/
    types.ts            All shared TypeScript types (no logic)
    daily.ts            Seed derivation, PRNG, level generation, BFS par
    engine.ts           Move application, Spectre advance, Caught, scoring, share text
    storage.ts          localStorage wrappers under ghostbbs:v1:*
tests/
  daily.test.ts         Determinism, solvability, par bounds, grid invariants
  engine.test.ts        Turn resolution, caught detection, scoring, share text
  storage.test.ts       Round-trip persistence, one-run-per-day, leaderboard logic
```

**Dependency rule:** `src/game/*` files may import from each other (and only from each other within `src/game/`). They must never import from `src/ui/*`, React, or any browser global. `src/ui/*` files may import from `src/game/*` but own no game logic themselves.

---

## Components and Interfaces

### src/game/types.ts

All types used across modules. No logic, no imports from other project files.

```typescript
// Coordinates on the 7×7 grid (0-indexed, row-major)
export type Cell = { row: number; col: number };

// What occupies a tile
export type Tile =
  | 'floor'
  | 'wall'
  | 'fragment'   // collectible 'o'
  | 'hatch'      // exit '>'
  | 'player'     // current player position (overlays floor/fragment/hatch)
  | 'spectre';   // current spectre position (overlays floor)

// 7×7 grid: grid[row][col] is the base tile (not including actor overlays)
export type Grid = ReadonlyArray<ReadonlyArray<Tile>>;

// A Spectre's full patrol loop, expressed as an ordered list of cells the
// spectre visits in sequence, wrapping back to index 0 after the last step.
export type SpectreRoute = ReadonlyArray<Cell>;

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

// Everything needed to start and replay a level
export interface Level {
  grid: Grid;                       // base tiles (walls, floor, fragments, hatch)
  playerStart: Cell;
  fragmentCells: ReadonlyArray<Cell>;
  hatchCell: Cell;
  spectreRoutes: ReadonlyArray<SpectreRoute>;  // length 2 or 3
  par: number;
}

// Live state during a run
export interface GameState {
  level: Level;
  playerPos: Cell;
  collectedFragments: number;         // count of fragments already picked up
  remainingFragments: ReadonlyArray<Cell>;  // cells not yet collected
  spectreIndices: ReadonlyArray<number>;    // current route-index per spectre
  turns: number;
  silentRun: boolean;                 // false once player is within Chebyshev 2 of any spectre
  outcome: 'playing' | 'success' | 'failure_caught' | 'failure_timeout';
  moveHistory: ReadonlyArray<MoveDirection>;
}

// Outcome type narrowed for completed runs
export type RunOutcome = 'success' | 'failure_caught' | 'failure_timeout';

// Stored in localStorage per completed run
export interface StoredRun {
  utcDate: string;           // 'YYYY-MM-DD'
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
  utcDate: string;           // 'YYYY-MM-DD'
  par: number;
}
```

### src/game/daily.ts

Responsible for: UTC date string derivation, `hash32`, `mulberry32` PRNG, procedural level generation, BFS par computation, and the static Fallback_Level.

**Exports:**
```typescript
export function utcDateString(date: Date): string;    // 'YYYY-MM-DD'
export function hash32(s: string): number;             // 32-bit unsigned int
export function mulberry32(seed: number): () => number; // returns [0,1) each call
export function generateLevel(date: Date): Level;
export const FALLBACK_LEVEL: Level;
```

**Must not import:** `src/ui/*`, React, any DOM API.

### src/game/engine.ts

Responsible for: applying a player move, advancing spectres, detecting Caught, incrementing turn count, checking timeout, computing score, generating share text.

**Exports:**
```typescript
export function initGameState(level: Level): GameState;
export function applyMove(state: GameState, dir: MoveDirection): GameState;
export function computeScore(turns: number, par: number, silentRun: boolean, outcome: RunOutcome): number;
export function generateShareText(level: Level, moveHistory: ReadonlyArray<MoveDirection>): string;
export function chebyshev(a: Cell, b: Cell): number;
```

`applyMove` is a pure function: given identical `state` and `dir` inputs it always returns an identical new `GameState`. It mutates nothing.

**Must not import:** `src/ui/*`, React, any DOM API.

### src/game/storage.ts

The sole module that touches `localStorage`. Every call is wrapped in `try/catch`. Keys follow `ghostbbs:v1:*`.

**Exports:**
```typescript
export function readHandle(): string | null;
export function writeHandle(handle: string): void;
export function readRun(utcDate: string, handle: string): StoredRun | null;
export function writeRun(run: StoredRun): void;
export function readScores(): LeaderboardEntry[];
export function writeScores(entries: LeaderboardEntry[]): void;
```

**Must not import:** `src/ui/*`, React, any game logic from `engine.ts` or `daily.ts` (it may import types from `types.ts` only).

### src/ui/App.tsx

Owns the top-level screen state machine (see UI State Machine section). Imports from `src/game/storage.ts` and `src/game/daily.ts` to decide the initial screen. Passes callbacks down to child screens.

### src/ui/Boot.tsx

Renders the modem-handshake sequence as timed text lines. Checks `window.matchMedia('(prefers-reduced-motion: reduce)')` and skips the animation if true. Accepts an `onDone: () => void` prop.

### src/ui/Menu.tsx

Renders the Main Menu, About, and Message Board sub-views. Handles keyboard shortcuts `D`, `M`, `H`, `?`. Displays the stored handle. Shows the Door button label as "RESULT" if today's run is already complete.

### src/ui/DoorGame.tsx

Holds the live `GameState` in React state. Attaches a `keydown` listener (suppresses default scroll for arrow keys during gameplay). Renders `<Board />`. On move: calls `applyMove`, updates state, and on terminal outcome writes the run via `storage.writeRun` and transitions the screen.

### src/ui/Board.tsx

Pure rendering component. Receives `GameState` and renders:
- The 7×7 grid as a `<pre>` block of box-drawing characters and tile glyphs.
- The HUD line (turn count / 30, fragments remaining) in an `aria-live="polite"` region.

### src/ui/ResultCard.tsx

Receives a `StoredRun` and the `Level`. Renders score, par, turns, outcome, and share text. Contains the clipboard copy button with 1 500 ms label feedback. Falls back to a `<textarea>` when the Clipboard API is absent. Renders the Leaderboard by calling `storage.readScores()`.

### src/ui/styles.css

Single stylesheet. Defines CSS variables:

```css
:root {
  --color-fg:      #33ff33;   /* phosphor green */
  --color-bg:      #0a0a0a;   /* near-black */
  --color-warning: #ffb000;   /* amber */
  --color-chrome:  #555555;   /* dim grey */
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas,
               "DejaVu Sans Mono", monospace;
  --cols: 80ch;
}
```

The CRT bezel is a fixed-width `80ch` container centred on the viewport. Below 640 px, `transform: scale()` shrinks it to fit. At 360 px no horizontal scrollbar appears. All frames use Unicode box-drawing characters (`─`, `│`, `┌`, `┐`, `└`, `┘`, `├`, `┤`). The flicker animation is wrapped in `@media (prefers-reduced-motion: no-preference)`.

---

## Data Models

### Storage Schema

All keys under `ghostbbs:v1:*`. Values are JSON-stringified.

| Key | Type stored | Purpose |
|-----|-------------|---------|
| `ghostbbs:v1:handle` | `string` | Player's BBS handle (1–20 chars) |
| `ghostbbs:v1:run:<YYYY-MM-DD>:<handle>` | `StoredRun` (JSON) | Completed run for that date + handle |
| `ghostbbs:v1:scores` | `LeaderboardEntry[]` (JSON) | Up to 10 leaderboard entries |

**StoredRun JSON shape:**
```json
{
  "utcDate": "2025-07-14",
  "handle": "SPECTRE",
  "outcome": "success",
  "score": 142,
  "par": 11,
  "turns": 13,
  "moveHistory": ["right","right","down","down","right","up","up","left","down","down","down","right","right"]
}
```

**LeaderboardEntry JSON shape (element of the scores array):**
```json
{
  "handle": "SPECTRE",
  "score": 142,
  "utcDate": "2025-07-14",
  "par": 11
}
```

**Leaderboard eviction rule:** When adding a new entry would bring the count above 10, remove the entry with the lowest `score`. If two entries tie for lowest score, remove the one with the lexicographically earlier `utcDate`. If the incoming entry has the same `handle` and `utcDate` as an existing entry, replace it only if the new `score` is strictly greater.

**Storage safety:** Every `localStorage` call is inside a `try/catch`. On any exception, `readHandle` returns `null`, `readRun` returns `null`, `readScores` returns `[]`, and write functions are silent no-ops.

---

## Level Generation Algorithm

### Step 1 — Seed Derivation

```
utcDate  = formatUTC(injectedDate)          // e.g. "2025-07-14"
seedStr  = "ghostbbs:" + utcDate            // e.g. "ghostbbs:2025-07-14"
seed     = hash32(seedStr)                  // 32-bit unsigned integer
rng      = mulberry32(seed)                 // stateful generator returning [0, 1)
```

`hash32` is a simple string-to-uint32 function (djb2-style or FNV-1a); the exact implementation must be fixed and never changed once shipped to preserve cross-device determinism.

`mulberry32` advances state as:
```
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
```

### Step 2 — Wall Placement

Place walls on the 7×7 floor grid:

1. Start with all 49 tiles as `floor`.
2. Draw candidate wall cells: for each of 8–12 wall candidates (count drawn from PRNG), pick a random cell from rows 1–5 (interior rows, not 0 or 6) and cols 1–5.
3. Mark each candidate as `wall`.
4. Reserve cells `(0,0)` and `(6,6)` as guaranteed non-wall (player start and hatch candidate region).

### Step 3 — Fragment, Hatch, and Player Placement

1. Collect all floor cells.
2. Set `playerStart` to `(0,0)` (always floor).
3. Shuffle the remaining floor cells using Fisher-Yates with the PRNG.
4. Pop the first 3 cells as `fragmentCells`; mark those tiles as `fragment`.
5. Pop the next cell as `hatchCell`; mark that tile as `hatch`.

### Step 4 — Spectre Patrol Route Generation

Generate 2 or 3 Spectres (count = 2 if `rng() < 0.5`, else 3):

For each spectre:
1. Pick a random floor tile as the route's first waypoint.
2. Pick 3–5 additional waypoints by walking random cardinal directions from the last waypoint, clamping to grid bounds and skipping walls.
3. Store the waypoint list as the `SpectreRoute`.
4. Set the spectre's initial `spectreIndex` to 0.

### Step 5 — BFS Solvability Check

Run a BFS from `playerStart` over the **collection graph**, ignoring Spectre positions:

- State: `(cell, collectedMask)` where `collectedMask` is a 3-bit bitmask of fragments collected.
- Transitions: move to any of the 4 cardinal neighbours that are not `wall` and within bounds, collecting any fragment on that cell.
- Goal: reach `hatchCell` with `collectedMask == 0b111`.
- If the goal state is unreachable, the level is **not solvable**.

**BFS also computes Par** as the number of steps in the shortest path from start to goal state.

### Step 6 — Fallback Substitution

If BFS finds no solution, discard the procedurally generated level and return `FALLBACK_LEVEL` — a hand-authored, statically defined `Level` object whose solvability is verified offline (and can be verified in tests). The fallback level's `par` is computed by the same BFS at startup (or hard-coded from an offline run, with a test ensuring it matches BFS output).

---

## Turn Resolution Order

The engine processes one turn via `applyMove(state, dir): GameState`. The exact sequence (Requirement 4.13):

1. **Apply player move.** Compute `nextPos` = `playerPos + dir`. If `nextPos` is outside the 7×7 bounds or the base tile at `nextPos` is `wall`, `nextPos = playerPos` (blocked). Set `playerPos = nextPos`.

2. **Fragment collection.** If `nextPos` matches any cell in `remainingFragments`, remove it from `remainingFragments` and increment `collectedFragments`.

3. **Hatch success check.** If `collectedFragments == 3` and `playerPos == hatchCell`, set `outcome = 'success'`. Return the new state immediately (no further processing).

4. **Advance spectres.** For each spectre `i`, increment `spectreIndices[i]` modulo the route length. Each spectre's new position is `spectreRoutes[i][spectreIndices[i]]`.

5. **Caught check.** For each spectre `i` at its new position `sp`:
   - If `chebyshev(playerPos, sp) <= 1`, set `outcome = 'failure_caught'`. Return immediately.
   
6. **Silent-run update.** For each spectre `i` at its new position `sp`:
   - If `chebyshev(playerPos, sp) <= 2`, set `silentRun = false`.

7. **Turn increment and timeout check.** Increment `turns`. If `turns >= 30`, set `outcome = 'failure_timeout'`. Return.

8. Return the updated state with `outcome = 'playing'`.

> Note on step 3 vs 5: Hatch success is checked *before* Spectre advance. A player who steps onto the hatch (with all fragments collected) wins even if a Spectre would have reached the same cell on the same turn.

---

## Scoring Formula

(Requirement 5)

Scoring applies only when `outcome == 'success'`.

```
baseScore  = max(0, par × 10 − (turns − par) × 2)
parBonus   = turns <= par ? 50 : 0
silentBonus = silentRun ? 30 : 0
score      = baseScore + parBonus + silentBonus
```

For failed runs (`failure_caught` or `failure_timeout`): `score = 0`.

**Examples:**
| Turns | Par | Silent | Score |
|-------|-----|--------|-------|
| 11 | 11 | yes | 110 + 50 + 30 = 190 |
| 11 | 11 | no  | 110 + 50 + 0  = 160 |
| 13 | 11 | no  | 106 + 0  + 0  = 106 |
| 25 | 11 | no  | max(0, 110−28)=82 |
| 40 | 11 | no  | 0 (clamped, also failure) |

---

## Share Text Encoding

(Requirement 7.2)

The share text is a 7-line string (lines joined by `\n`) where each line contains exactly 7 Unicode block glyphs.

**Glyph mapping:**
| Condition | Glyph | Unicode |
|-----------|-------|---------|
| Player starting tile | `▓` | U+2593 |
| Tile visited by player (not start) | `█` | U+2588 |
| Tile not visited | `░` | U+2591 |

**Generation algorithm (`generateShareText`):**

1. Re-simulate the run from `level.playerStart` following `moveHistory`, recording the set of visited cells `V`.
2. For each cell `(r, c)` in row-major order:
   - If `(r, c) == level.playerStart` → `▓`
   - Else if `(r, c) ∈ V` → `█`
   - Else → `░`
3. Group into 7 rows of 7 glyphs, join rows with `\n`.

Spectre routes and fragment positions do not appear as distinct glyphs. The output encodes only the player's footprint, so it reveals path shape without revealing the puzzle layout.

---

## UI State Machine

`App.tsx` manages a `Screen` enum value in React state.

```typescript
type Screen =
  | 'boot'
  | 'login'
  | 'menu'
  | 'door'
  | 'result';
```

**Initial screen selection (on mount):**
```
if (prefers-reduced-motion OR handle already stored):
  skip 'boot' → go to 'login' (if no handle) OR 'menu' (if handle present)
else:
  start at 'boot'
```

**Transition table:**

| From | Event | To |
|------|-------|----|
| `boot` | Animation complete or skipped | `login` (no stored handle) or `menu` (handle present) |
| `login` | Handle submitted (valid) | `menu` |
| `menu` | `[D]` pressed, today's run absent | `door` |
| `menu` | `[D]` pressed, today's run present | `result` |
| `menu` | `[M]` pressed | `menu` (sub-view: message board) |
| `menu` | `[H]` pressed | `menu` (sub-view: leaderboard) |
| `menu` | `[?]` pressed | `menu` (sub-view: about) |
| `door` | Run ends (any outcome) | `result` |
| `result` | Back / main menu | `menu` |

The message board, leaderboard, and about screens are sub-views rendered inside `Menu.tsx`, not separate `Screen` enum values, to keep the state machine minimal.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Level Determinism

*For any* UTC date string, calling `generateLevel` twice with two separate `Date` objects representing the same UTC date SHALL produce `Level` values that are structurally identical: same wall layout, same `playerStart`, same `fragmentCells`, same `hatchCell`, and the same spectre patrol routes in the same order.

**Validates: Requirements 3.1, 3.3**

### Property 2: Universal Solvability

*For any* UTC date in a 30-day window, the `Level` returned by `generateLevel` SHALL be BFS-solvable: there exists a path from `playerStart` to `hatchCell` that collects all 3 fragments, traversing only non-wall tiles.

**Validates: Requirements 3.5, 3.6, 15.2**

### Property 3: Par Bounds Invariant

*For any* `Level` returned by `generateLevel`, the `par` field SHALL satisfy `5 <= par <= 30`. (Minimum 5: at least 3 fragment steps + 1 hatch step + at least 1 total move; maximum 30: the turn limit.)

**Validates: Requirements 3.7, 4.1, 4.2**

### Property 4: Grid Structure Invariant

*For any* `Level` returned by `generateLevel`, the `grid` SHALL be exactly 7 rows × 7 columns, contain exactly 3 `fragment` tiles, exactly 1 `hatch` tile, and have `playerStart` on a non-wall tile.

**Validates: Requirements 4.1, 4.2**

### Property 5: Move Application Preserves Bounds

*For any* `GameState` with `outcome == 'playing'` and any `MoveDirection`, calling `applyMove` SHALL return a new state where `playerPos` satisfies `0 <= row < 7` and `0 <= col < 7`, and `playerPos` is never a `wall` tile.

**Validates: Requirements 4.3, 4.4**

### Property 6: Fragment Collection Monotonicity

*For any* `GameState` and `MoveDirection`, if `applyMove` moves the player onto a fragment cell, `collectedFragments` in the returned state SHALL be exactly `state.collectedFragments + 1`, and that cell SHALL no longer appear in `remainingFragments`.

**Validates: Requirements 4.5**

### Property 7: Spectre Advance Exactly One Step

*For any* `GameState` with `outcome == 'playing'` and any `MoveDirection`, after `applyMove`, each spectre's index SHALL have advanced by exactly 1 modulo its route length (unless the game ended in step 3 — Hatch success — before spectres advanced).

**Validates: Requirements 4.8**

### Property 8: Caught Condition Correctness

*For any* player position and set of spectre positions, `outcome` SHALL be `'failure_caught'` if and only if at least one spectre satisfies `chebyshev(playerPos, spectrePos) <= 1` after the Spectre advance step of that turn, or the Spectre's post-advance position equals `playerPos`.

**Validates: Requirements 4.9, 4.10, 15.4**

### Property 9: Scoring Formula

*For any* successful run with `turns`, `par`, and `silentRun` values, `computeScore` SHALL return exactly `max(0, par * 10 - (turns - par) * 2) + (turns <= par ? 50 : 0) + (silentRun ? 30 : 0)`.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 10: Silent-Run Flag Monotonicity

*For any* `GameState` sequence, once `silentRun` is set to `false` it SHALL never return to `true` within the same run, and it SHALL be set to `false` on any turn where `chebyshev(playerPos, spectrePos) <= 2` for any spectre after Spectre advance.

**Validates: Requirements 5.5**

### Property 11: Share Text Structure

*For any* `Level` and `moveHistory`, `generateShareText` SHALL return a string of exactly 7 lines (split by `\n`), each line containing exactly 7 characters, and every character SHALL be one of `░`, `▓`, or `█`.

**Validates: Requirements 7.2, 15.5**

### Property 12: Share Text Determinism

*For any* fixed `Level` and `moveHistory`, calling `generateShareText` twice SHALL return the identical string.

**Validates: Requirements 7.2, 15.5**

### Property 13: StoredRun Round-Trip

*For any* `StoredRun` value, writing it via `writeRun` and reading it back via `readRun` with the same `utcDate` and `handle` SHALL return a value deeply equal to the original.

**Validates: Requirements 6.1, 6.3**

### Property 14: Leaderboard Size Invariant

*For any* sequence of `writeRun` and `readScores` calls (with score > 0), the array returned by `readScores` SHALL contain at most 10 entries.

**Validates: Requirements 8.2**

### Property 15: Leaderboard Sort Order

*For any* stored leaderboard state, `readScores` SHALL return entries sorted by `score` descending; entries with equal scores SHALL be ordered by `utcDate` descending (most recent first).

**Validates: Requirements 8.3**

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| `generateLevel` passed `null`/`undefined` | Throws `Error('generateLevel: invalid date')` before any PRNG access |
| Procedural level fails BFS solvability | Substitutes `FALLBACK_LEVEL`; never throws |
| `localStorage` throws on read | Returns safe default: `null` for handle/run, `[]` for scores |
| `localStorage` throws on write | Silent no-op; run continues in-memory |
| Clipboard API unavailable | `ResultCard` renders `<textarea>` fallback instead of copy button |
| `applyMove` called on a terminal state | Returns the same state unchanged (no-op guard) |

All `storage.ts` functions are individually wrapped; a quota error on `writeRun` does not break `readHandle` on the next call.

---

## Testing Strategy

PBT is appropriate for this feature: `src/game/` consists entirely of pure functions over structured inputs. The input space (dates, game states, move sequences) is large and varied. Vitest with [fast-check](https://fast-check.dev/) provides the property-based harness; each property test runs a minimum of 100 iterations.

### Test Files

#### tests/daily.test.ts

Covers `src/game/daily.ts`.

| Test | Type | Requirements |
|------|------|-------------|
| Determinism: generate same level for same date | Property (Property 1) | 3.1, 3.3, 15.1 |
| Solvability: 30 consecutive dates all BFS-solvable | Property (Property 2) | 3.5, 3.6, 15.2 |
| Par bounds: 5 ≤ par ≤ 30 for all generated levels | Property (Property 3) | 3.7 |
| Grid structure: 7×7, 3 fragments, 1 hatch | Property (Property 4) | 4.1, 4.2 |
| Fallback level is BFS-solvable | Example | 3.5, 3.9 |
| `generateLevel(null)` throws | Edge case | 3.8 |
| Injected date is the sole clock source | Example | 3.2 |

#### tests/engine.test.ts

Covers `src/game/engine.ts`.

| Test | Type | Requirements |
|------|------|-------------|
| Move stays in bounds, never enters wall | Property (Property 5) | 4.3, 4.4 |
| Fragment collection increments count and removes cell | Property (Property 6) | 4.5 |
| Spectre advances exactly one route step per turn | Property (Property 7) | 4.8 |
| Caught when Chebyshev ≤ 1 after advance | Property (Property 8) | 4.9, 4.10, 15.4 |
| Not caught when Chebyshev > 1 | Property (Property 8) | 4.9 |
| Scoring formula holds for all (turns, par, silent) triples | Property (Property 9) | 5.1, 5.2, 5.3, 15.3 |
| Failure returns score 0 | Example | 5.4, 15.3 |
| Silent-run flag false once player within distance 2 | Property (Property 10) | 5.5 |
| Turn resolution order: hatch success before spectre advance | Example | 4.6, 4.13 |
| Turn resolution order: caught evaluated after advance | Example | 4.9, 4.13 |
| Timeout at turn 30 | Example | 4.11, 15.3 |
| Hatch passable before all fragments collected | Edge case | 4.7 |
| Share text is 7×7 with correct glyphs | Property (Property 11) | 7.2, 15.5 |
| Share text is deterministic for same inputs | Property (Property 12) | 7.2, 15.5 |

#### tests/storage.test.ts

Covers `src/game/storage.ts`.

| Test | Type | Requirements |
|------|------|-------------|
| StoredRun round-trip (write then read) | Property (Property 13) | 6.1, 6.3 |
| One-run-per-day: second run returns stored result | Example | 6.2, 15.6 |
| Leaderboard size never exceeds 10 | Property (Property 14) | 8.2 |
| Leaderboard sorted by score descending | Property (Property 15) | 8.3 |
| Same handle+date with higher score replaces existing entry | Example | 8.1 |
| Same handle+date with equal/lower score does not replace | Example | 8.1 |
| Storage unavailable: reads return safe defaults | Edge case | 8.5, 14.1–14.4 |
| Storage unavailable: writes are silent no-ops | Edge case | 8.5 |
| All keys under `ghostbbs:v1:` namespace | Example | 14.2 |

### Fast-Check Configuration

```typescript
// Each property runs ≥ 100 iterations
fc.assert(fc.property(...), { numRuns: 100 });
```

Tag format used in test comments:
```
// Feature: ghostbbs, Property N: <property title>
```

### TypeScript Validation

`tsc --noEmit` (strict mode) is part of CI and counts as coverage for DOM-import and type-safety constraints. The PostFileSave hook runs it automatically and logs results to `.kiro/hook-log.txt`.
