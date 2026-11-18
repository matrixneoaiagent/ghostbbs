# Implementation Plan: GHOSTBBS

## Overview

Build GHOSTBBS bottom-up: shared types → storage → daily level generation → game engine → UI screens → README and docs stubs. Tests for each module follow immediately after the module is implemented. All pure engine code (`src/game/`) is complete before any UI file is touched.

## Tasks

- [x] 1. Scaffold project files
  - Confirm `vite.config.ts` sets `base: './'` and exports a Vite config with no extra plugins.
  - Confirm `tsconfig.json` enables `strict: true`, targets ES2020+, includes `src` and `tests`.
  - Confirm `package.json` defines scripts: `dev` (`vite`), `build` (`vite build`), `test` (`vitest --run`), `typecheck` (`tsc --noEmit`).
  - Confirm `index.html` mounts `<div id="root">` and loads `src/main.tsx` as a module script.
  - Files: `vite.config.ts`, `tsconfig.json`, `package.json`, `index.html`
  - _Requirements: 12.2, 12.3_
  - Verification: `npm run build` exits 0.

- [x] 2. Create shared types
  - Implement `src/game/types.ts` containing every type from the design: `Cell`, `Tile`, `Grid`, `SpectreRoute`, `MoveDirection`, `Level`, `GameState`, `RunOutcome`, `StoredRun`, `LeaderboardEntry`.
  - No logic, no imports from other project files.
  - File: `src/game/types.ts`
  - _Requirements: 13.1, 13.2_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 3. Implement storage module
  - [x] 3.1 Implement `src/game/storage.ts`
    - Export `readHandle`, `writeHandle`, `readRun`, `writeRun`, `readScores`, `writeScores`.
    - Every `localStorage` call is inside a `try/catch`; safe defaults on failure (`null` / `[]`).
    - All keys use the `ghostbbs:v1:` prefix.
    - Leaderboard eviction: cap at 10 entries; evict lowest score (break ties by earlier `utcDate`); replace same handle+date only when new score is strictly greater.
    - File: `src/game/storage.ts`
    - _Requirements: 8.1, 8.2, 8.4, 14.1, 14.2, 14.3, 14.4_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 4. Test storage module
  - [x]* 4.1 Write `tests/storage.test.ts`
    - `StoredRun` round-trip: `writeRun` then `readRun` returns a deeply equal value. (Property 13)
    - One-run-per-day: a second `writeRun` for the same date+handle does not change the stored result when the new score is not strictly greater. (Req 6.2)
    - Leaderboard size never exceeds 10 after repeated inserts. (Property 14)
    - Leaderboard sorted by score descending after inserts. (Property 15)
    - Same handle+date with strictly higher score replaces; equal/lower does not replace. (Req 8.1)
    - Storage unavailable (mocked `localStorage` throws): reads return safe defaults, writes are silent no-ops. (Req 8.5, 14.3)
    - All keys begin with `ghostbbs:v1:`. (Req 14.2)
    - File: `tests/storage.test.ts`
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.5, 14.2, 14.3, 15.6_
  - Verification: `npm test -- --run storage` exits 0.

- [x] 5. Implement level generation (placement)
  - [x] 5.1 Implement seed helpers and wall/fragment/hatch/spectre placement in `src/game/daily.ts`
    - Export `utcDateString(date: Date): string` — formats UTC date as `YYYY-MM-DD`.
    - Export `hash32(s: string): number` — djb2-style fixed hash to 32-bit unsigned int; must never change once shipped.
    - Export `mulberry32(seed: number): () => number` — stateful PRNG returning `[0, 1)`.
    - Internal `generateLevelUnchecked`: seeds PRNG from `hash32("ghostbbs:" + utcDateString(date))`, places 8–12 walls on interior cells, places player start at `(0,0)`, Fisher-Yates shuffles floor cells to place 3 fragments and 1 hatch, generates 2–3 spectre patrol routes.
    - `Date` is the sole clock source; never call `Math.random()`.
    - Files: `src/game/daily.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 6. Implement BFS, par computation, and fallback substitution
  - [x] 6.1 Add BFS solvability check and par computation to `src/game/daily.ts`
    - BFS over `(cell, collectedMask)` state space; walls block movement; goal is hatch with mask `0b111`.
    - `par` = BFS step count of shortest path.
    - Export `generateLevel(date: Date): Level` — calls `generateLevelUnchecked`, BFS-verifies; substitutes `FALLBACK_LEVEL` on failure.
    - Export `const FALLBACK_LEVEL: Level` — hand-authored, statically correct level; par hard-coded from offline BFS run and verified by test.
    - Throw `Error('generateLevel: invalid date')` when `date` is null or undefined.
    - File: `src/game/daily.ts`
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 15.2_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 7. Test daily module
  - [x]* 7.1 Write `tests/daily.test.ts`
    - Determinism: `generateLevel` called twice with identical UTC date objects produces structurally equal levels. (Property 1)
    - Solvability: generate levels for 30 consecutive UTC dates; every level is BFS-solvable. (Property 2)
    - Par bounds: `5 <= par <= 30` for all levels in a 30-date window. (Property 3)
    - Grid structure: every level is exactly 7×7, contains exactly 3 fragments and 1 hatch, and `playerStart` is a non-wall tile. (Property 4)
    - Fallback level is BFS-solvable. (Req 3.9)
    - `generateLevel(null)` throws. (Req 3.8)
    - Injected `Date` is the sole clock source: same call with two different `Date` objects for different UTC dates produces different grids. (Req 3.2)
    - File: `tests/daily.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 15.1, 15.2_
  - Verification: `npm test -- --run daily` exits 0.

- [x] 8. Implement core move application
  - [x] 8.1 Implement `initGameState`, `applyMove`, and `chebyshev` in `src/game/engine.ts`
    - `chebyshev(a, b)`: `max(|a.row-b.row|, |a.col-b.col|)`.
    - `initGameState(level)`: builds initial `GameState` from a `Level`.
    - `applyMove(state, dir)`: pure function implementing the full 8-step turn resolution from the design:
      1. Compute `nextPos`; block at walls and boundaries (player stays, turn consumed).
      2. Fragment collection: remove from `remainingFragments`, increment `collectedFragments`.
      3. Hatch success check: if all collected and on hatch, return `outcome: 'success'`.
      4. Advance spectres: each index increments mod route length.
      5. Caught check: `chebyshev(playerPos, sp) <= 1` → `outcome: 'failure_caught'`.
      6. Silent-run update: `chebyshev(playerPos, sp) <= 2` → `silentRun = false`.
      7. Turn increment and timeout: if `turns >= 30` → `outcome: 'failure_timeout'`.
      8. Return updated state with `outcome: 'playing'`.
    - Guard: if `state.outcome !== 'playing'` return `state` unchanged.
    - No DOM imports, no module-level mutable state.
    - File: `src/game/engine.ts`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 5.5, 13.1, 13.2_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 9. Implement scoring and share text
  - [x] 9.1 Add `computeScore` and `generateShareText` to `src/game/engine.ts`
    - `computeScore(turns, par, silentRun, outcome)`: formula `max(0, par*10 - (turns-par)*2) + parBonus + silentBonus`; failed runs return 0.
    - `generateShareText(level, moveHistory)`: re-simulate movement from `level.playerStart`, build visited set `V`, map each of 49 cells to `▓`/`█`/`░`, return 7 lines of 7 chars joined by `\n`.
    - File: `src/game/engine.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.2, 13.2, 15.3, 15.5_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 10. Test engine module
  - [x]* 10.1 Write `tests/engine.test.ts`
    - Move stays in bounds and never enters wall (Property 5). (Req 4.3, 4.4)
    - Fragment collection increments count and removes cell (Property 6). (Req 4.5)
    - Spectre advances exactly one route step per turn (Property 7). (Req 4.8)
    - Caught when Chebyshev ≤ 1 after advance; not caught when Chebyshev > 1 (Property 8). (Req 4.9, 4.10)
    - Scoring formula holds for `(turns, par, silentRun)` triples (Property 9). (Req 5.1, 5.2, 5.3)
    - Failed run score is 0. (Req 5.4)
    - Silent-run flag becomes false once player within distance 2; never reverts (Property 10). (Req 5.5)
    - Turn resolution order: hatch success fires before spectre advance. (Req 4.6, 4.13)
    - Turn resolution order: caught evaluated after spectre advance. (Req 4.9, 4.13)
    - Timeout triggers at turn 30. (Req 4.11)
    - Hatch is passable before all fragments collected. (Req 4.7)
    - Share text is 7×7 with only `░`/`▓`/`█` chars (Property 11). (Req 7.2)
    - Share text is deterministic for identical inputs (Property 12). (Req 7.2)
    - File: `tests/engine.test.ts`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 5.1, 5.2, 5.3, 5.4, 5.5, 7.2, 15.3, 15.4, 15.5_
  - Verification: `npm test` exits 0 (all three test files pass).

- [x] 11. Checkpoint — all engine tests pass
  - Ensure all tests pass. Run `npm test` and `npx tsc --noEmit`. Ask the user if any issues arise.

- [x] 12. Implement stylesheet
  - Create `src/ui/styles.css` with:
    - CSS variables: `--color-fg: #33ff33`, `--color-bg: #0a0a0a`, `--color-warning: #ffb000`, `--color-chrome: #555555`, `--font-mono` stack.
    - `.crt-bezel` container: `width: 80ch`, centred, near-black background.
    - `@media (max-width: 640px)` rule scaling the bezel with `transform: scale()` to avoid horizontal scrolling at 360 px.
    - Box-drawing frame utility classes.
    - CRT flicker animation wrapped in `@media (prefers-reduced-motion: no-preference)`.
    - `:focus-visible` outline at ≥ 2 px; focus ring never suppressed.
    - File: `src/ui/styles.css`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.2_
  - Verification: `npx tsc --noEmit` exits 0; `npm run build` exits 0.

- [x] 13. Scaffold React root and App screen state machine
  - Create `src/main.tsx`: imports `App` and mounts it into `#root`.
  - Create `src/ui/App.tsx`:
    - `Screen` type: `'boot' | 'login' | 'menu' | 'door' | 'result'`.
    - On mount: check `prefers-reduced-motion` and stored handle to pick initial screen per the design transition table.
    - Renders `<Boot />`, `<Menu />`, `<DoorGame />`, or `<ResultCard />` depending on `screen` state; `<Boot />` and login prompt rendered for their respective screens.
    - Passes screen-transition callbacks as props to child components.
  - Files: `src/main.tsx`, `src/ui/App.tsx`
  - _Requirements: 1.3, 1.6, 2.1_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 14. Implement Boot screen
  - Create `src/ui/Boot.tsx`:
    - Renders modem handshake text lines sequentially; total animation 1.8–2.2 s.
    - Checks `prefers-reduced-motion`; if set, calls `onDone` immediately without rendering animation.
    - Provides a visible skip `<button>` that calls `onDone` immediately.
    - Props: `onDone: () => void`.
  - File: `src/ui/Boot.tsx`
  - _Requirements: 1.1, 1.2, 1.3, 10.8_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 15. Implement Login screen (handle prompt) and wire to App
  - Add a login sub-view inside `App.tsx` (or a small inline component):
    - Text input for the handle (1–20 characters).
    - On submit: validates length; on success writes handle via `storage.writeHandle` and transitions to `'menu'`.
    - Inline error message for empty submit (Req 1.7) and for handle exceeding 20 chars (Req 1.8).
  - File: `src/ui/App.tsx` (or extracted `Login.tsx` if file grows past ~200 lines)
  - _Requirements: 1.4, 1.5, 1.7, 1.8_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 16. Implement Main Menu, About, and Message Board
  - Create `src/ui/Menu.tsx`:
    - Renders four `<button>` elements: `[D]`, `[M]`, `[H]`, `[?]`.
    - Keyboard shortcuts `D`, `M`, `H`, `?` (case-insensitive) bound via `keydown` listener.
    - Displays stored handle as a non-editable label (Req 2.7).
    - If today's run is already stored, the Door button label changes to indicate completion and activates the result view (Req 2.8).
    - Sub-views rendered in-place: Message Board (4–6 static in-fiction posts with at least one fragment hint and one lore item, scrollable via arrow/page keys — Req 9.1–9.5), About, and Leaderboard (placeholder; full implementation in task 20).
    - Props: `handle: string`, `onDoor: () => void`, `onResult: () => void`, `onBack: () => void`.
  - File: `src/ui/Menu.tsx`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.1, 9.2, 9.3, 9.4, 9.5, 11.1_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 17. Implement DoorGame and Board
  - Create `src/ui/DoorGame.tsx`:
    - Holds `GameState` in React state; initialises from `generateLevel(new Date())`.
    - Attaches `keydown` listener for Arrow keys and WASD; suppresses default scroll behaviour during play (Req 11.4).
    - On move: calls `applyMove`, updates state; on terminal outcome writes run via `storage.writeRun` and calls `onDone(storedRun)`.
    - Renders `<Board state={gameState} />` and an on-screen D-pad (4 `<button>` elements with accessible names "Move Up" etc. — Req 11.1).
    - Props: `handle: string`, `onDone: (run: StoredRun) => void`.
  - Create `src/ui/Board.tsx`:
    - Pure rendering component: `props: { state: GameState }`.
    - Renders the 7×7 grid as a `<pre>` block of box-drawing characters with tile glyphs overlaid for player and spectres.
    - HUD line showing turn count / 30 and fragments remaining, inside a `<div aria-live="polite">` (Req 4.12, 11.3).
  - Files: `src/ui/DoorGame.tsx`, `src/ui/Board.tsx`
  - _Requirements: 4.3, 4.12, 6.1, 11.1, 11.3, 11.4, 13.3_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 18. Implement ResultCard
  - Create `src/ui/ResultCard.tsx`:
    - Props: `run: StoredRun`, `level: Level`, `onBack: () => void`.
    - Renders outcome, score, par, turns, and share text (via `generateShareText(level, run.moveHistory)`).
    - Copy `<button>`: writes share text to `navigator.clipboard.writeText`; updates label to a success indication for ≥ 1 500 ms then reverts (Req 7.6).
    - If Clipboard API absent: renders a `<textarea>` containing the share text in place of the copy button (Req 7.4).
    - Back `<button>` to return to `'menu'`.
  - File: `src/ui/ResultCard.tsx`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 19. Implement Leaderboard display in ResultCard and Menu
  - Add Leaderboard rendering to `src/ui/ResultCard.tsx` (shown below the result) and to the `[H]` sub-view in `src/ui/Menu.tsx`:
    - Call `storage.readScores()` and render up to 10 entries sorted by score descending.
    - Each row shows rank, handle, score, par, and UTC date.
  - Files: `src/ui/ResultCard.tsx`, `src/ui/Menu.tsx`
  - _Requirements: 8.3, 8.4_
  - Verification: `npx tsc --noEmit` exits 0.

- [x] 20. Checkpoint — full build and all tests pass
  - Run `npm run build && npm test`. Confirm zero TypeScript errors and all tests pass. Ask the user if any issues arise.
  - **Visual QA checklist (screenshot review):**
    - [x] Terminal panel: phosphor-green border on left/right edges, inset glow visible, header bar shows breadcrumb + NODE 0x1F, footer shows `ghostbbs:v1`, UTC date and key hints.
    - [x] Boot: full GHOSTBBS wordmark (6 rows × 68 cols) renders inside panel, modem lines appear sequentially, `[ SKIP ]` button visible and focusable.
    - [x] Menu: wordmark renders above menu box, bordered `.menu-box` with MAIN MENU title, four `[D]/[M]/[H]/[?]` buttons, handle shown as "Connected as: HANDLE".
    - [x] Board: grid renders with ASCII `┌─┐ │ │ └─┘` frame, each cell 2ch wide at ~20px; `·` floor dots in dim green, `#` walls grey, `o` fragments amber, `>` hatch cyan, `@` player green, `S` spectre amber; HUD bar reads `TURN 00/30 · FRAGMENTS 3 LEFT`; legend below grid; content vertically centred.
    - [x] Result card: outcome banner bordered (green/amber), stats block, path trace 7×7 `white-space:pre` block with copy button, leaderboard table, `NO CARRIER` goodbye line.
    - [x] 360 px wide: no horizontal scroll, footer hints hidden, buttons full-width.

- [x] 21. Write README
  - Create `README.md` with:
    - One-paragraph project description (BBS fiction, daily puzzle, no backend).
    - **Run / Build / Test** section: `npm install`, `npm run dev`, `npm run build`, `npm test`, `npx tsc --noEmit`.
    - **Tech steering summary**: Vite 7 + React 19 + TypeScript strict, Vitest, mulberry32 PRNG, BFS solvability guarantee, localStorage persistence, no CDN/runtime fetches.
    - Note that no extra npm dependencies were added beyond those in `package.json`.
  - File: `README.md`
  - _Requirements: 12.1, 12.2_
  - Verification: file exists and is non-empty.

- [x] 22. Create docs/screenshots placeholder
  - Create `docs/screenshots/.gitkeep` so the directory exists in version control for future screenshot assets.
  - File: `docs/screenshots/.gitkeep`
  - Verification: `ls docs/screenshots/` lists `.gitkeep`; `npm run build && npm test` both still pass.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Checkpoints (tasks 11 and 20) ensure incremental validation before moving to the next layer.
- Property tests reference the numbered properties in `design.md` Correctness Properties section.
- `src/game/` files must remain importable by Vitest in Node with no DOM types in function signatures.
- If any `src/ui/` file grows past ~200 lines, split it rather than adding another concern.
- The leaderboard write path (eviction logic) lives entirely in `storage.ts`; `ResultCard` and `Menu` only call `readScores`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["8.1"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["11"] },
    { "id": 11, "tasks": ["12"] },
    { "id": 12, "tasks": ["13"] },
    { "id": 13, "tasks": ["14", "15"] },
    { "id": 14, "tasks": ["16"] },
    { "id": 15, "tasks": ["17"] },
    { "id": 16, "tasks": ["18"] },
    { "id": 17, "tasks": ["19"] },
    { "id": 18, "tasks": ["20"] },
    { "id": 19, "tasks": ["21", "22"] }
  ]
}
```
