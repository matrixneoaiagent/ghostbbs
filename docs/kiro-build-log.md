# GHOSTBBS — Kiro build log

Kiro CLI 3.5.0, headless (`kiro-cli chat --no-interactive --trust-all-tools
--trust-workspace`), logged in with Google SSO on the **free** plan. No API key, no
paid credits, no card. Every call ran inside a NixOS `buildFHSEnv` sandbox
(`./fhs/bin/kiro-fhs -c '…'`) because the bundled Node runtime needs an FHS root.

Transcripts of each session's output are in `docs/kiro-runs/`.

## Credit readings

| When | Where | Reading |
|---|---|---|
| before run 1 | app.kiro.dev → Settings → Account | `0 used / 50 covered in plan`, resets 12/01 |
| after runs 1–3 (spec) | same page | `0 used / 50` |
| after run 6 | same page | `0 used / 50` |
| during run 8 | CLI response | `UsageLimitReachedError: You've reached your monthly usage limit` |

The web meter never moved off zero in this session (it appears to lag or to count a
different quota), but the CLI is authoritative: **the free monthly allowance was
consumed by these eight runs**. The last run was cut off mid-edit, and the remaining
CSS touch-ups were finished by hand (listed at the end of this file).

## Runs

### 1 — spec: requirements

Mode: `--mode spec`. Prompt:

> Create the spec for feature ghostbbs: a browser SPA that resurrects a 1980s BBS as a
> playable daily door game. Requirements only for now. Follow .kiro/steering exactly:
> Vite+React+TS SPA, no backend, 7x7 seeded grid, collect 3 fragments then reach the
> hatch, 2-3 patrolling spectres (Chebyshev distance 1 = caught), BFS par, one run per
> UTC day stored in localStorage, shareable text result, local leaderboard, static
> message board, CRT/ANSI look. Keep it small: about 15 source files. Write
> requirements.md under .kiro/specs/ghostbbs/ with user stories and EARS-style
> acceptance criteria.

Result: `.kiro/specs/ghostbbs/requirements.md`, 15 requirements, 268 lines.

### 2 — spec: design

Mode: `--mode spec -r`. Prompt: *"Requirements approved, no changes. Generate design.md
for this feature now, then stop before tasks. Keep it to module boundaries, types, the
level-generation/BFS algorithm, turn resolution order, scoring, storage schema and test
plan. Match .kiro/steering."*

Result: `design.md`, 620 lines (types, eight-step turn resolution, scoring table,
correctness properties, test plan).

### 3 — spec: tasks

Mode: `--mode spec -r`. Prompt: *"Design approved. Generate tasks.md now: numbered,
dependency-ordered, each task small enough for one agent pass, with explicit file paths
and a verification step (test or command). … Stop after tasks.md."*

Result: `tasks.md` — 22 tasks in 20 dependency waves.

### 4 — engine (tasks 1–9)

Prompt: implement `types.ts`, `storage.ts`, `daily.ts` (level generation + BFS par +
fallback), `engine.ts` (applyMove/scoring/share), and the three vitest files; do not
reinstall dependencies; verify with `npm run typecheck` and `npm test`; tick tasks.

Result: all engine files + 56 tests, typecheck clean. The PostFileSave hook fired 13
times during this run and caught three real type errors (`.kiro/hook-log.txt`). One
test (a hand-built winning path on `FALLBACK_LEVEL`) still failed at the 15-minute
timeout; run 5 fixed it.

### 5 — UI (tasks 11–17)

Prompt: fix the failing fallback test, then implement `styles.css`, `main.tsx`, `App.tsx`,
`Boot`, `Login`, `Menu`, `Board`, `DoorGame`, `ResultCard`; verify typecheck, test, build;
tick tasks.

Result: whole UI, 56/56 tests, production build green.

### 6 — visual QA

Screenshots of the first build showed a full-height strip with content jammed top-left.
Prompt asked for a real terminal panel (border, header wordmark, footer status bar),
2ch cells with an ASCII frame, a HUD status line, a result "goodbye" screen, keeping
a11y and the 360 px layout.

Result: `styles.css`, `App.tsx`, `Boot.tsx`, `Menu.tsx`, `Board.tsx`, `ResultCard.tsx`,
`Login.tsx` rewritten. The wordmark came out clipped to "GHOST".

### 7 — wordmark, share block, README

Prompt: fix the clipped wordmark (must spell GHOSTBBS), stop the PATH TRACE block from
wrapping, centre the door game, fix HUD spacing; then write `README.md` and this log;
verify and tick tasks 18–22.

Result: wordmark fixed, README + log created, tasks ticked.

### 8 — final layout (cut off by the usage limit)

Prompt: enlarge the board to 3ch cells at 24 px with a mobile clamp, centre it in the
terminal body, make the share block readable, centre the menu column.

Result: CSS variables and cell sizing landed; the run died on
`UsageLimitReachedError` before the container alignment was finished.

## Done by hand after the limit

- `styles.css`: centre `.door-game`, make the HUD span the grid width, unfix the
  share-block width.
- `ResultCard.tsx`: two-line share header (date, outcome, score, turns, par) above the
  glyph grid, and the copy button label.
- This log, the README corrections, screenshots, git history, GitHub publication.

Everything in `src/game/` and the components themselves was written by Kiro, except the
survivability guard described below.

## Added by hand after the first playtest (2026-11-19)

Kiro's `generateLevel` proved a level solvable with a BFS that ignores the spectres. The
2026-11-18 daily level exposed the gap: a patrol route camped on the hatch corner, so the
last fragment was always fatal and the day could not be won by anyone.

The fix is hand-written, not Kiro: `hasWinningLine()` in `src/game/daily.ts` replays the
real turn resolver over the (cell, collected fragments, patrol phase) state space and only
accepts a candidate level if some move sequence reaches the hatch alive. Two regression
tests were added with it (59 tests total): one sweeps 45 consecutive dates, one pins the
broken 2026-11-18 shape as a level that must be rejected.
