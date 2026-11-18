Let me read the current state of everything before making any changes.
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
Now I have everything I need. Let me work out the wordmark precisely before writing any files.
[tool] Measure existing wordmark line lengths
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
[tool] Design a full GHOSTBBS wordmark that fits 80 columns
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
[tool] Verify full 8-letter GHOSTBBS wordmark dimensions
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
68–69 columns — fits in 80ch. Now let me verify those box-drawing characters render correctly by checking the actual character count vs visual width (box-drawing chars are 1 column wide in terminals):
[tool] Validate full wordmark dimensions and BBS presence
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
All 6 rows are 68 chars — well within 80ch. Now I'll make all the changes. I'll do the three CSS/component fixes and then the docs files:
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
Now fix the CSS for the wordmark (overflow hidden → visible, never clips), the share text (white-space: pre, fixed width, line-height 1), the board centering, and HUD bullet separator:
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
I have enough context. Rather than patching dozens of small changes across the existing CSS, I'll rewrite the full stylesheet with all fixes applied cleanly — it's the only CSS file and all the changes are surgical:
[tool] Write File
[tool] status: Pending
[tool] status: Completed
Now fix `Board.tsx` to use `.door-game-wrap`, the bullet separator in the HUD, and the corrected grid frame logic:
[tool] Write File
[tool] status: Pending
[tool] status: Completed
Board uses `React.ReactNode` — need the React import. Also update `DoorGame.tsx` to wrap Board in the centring wrapper (or Board handles it internally, which it now does via `.door-game-wrap`). Let me check the import:
[tool] Typecheck after Board rewrite
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Failed: Typecheck after Board rewrite
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
[tool] Typecheck again
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
Clean. Now write the README and the build log:
[tool] Check what's in docs/
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
[tool] Write File
[tool] status: Pending
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] List all kiro run files
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
[tool] Write File
[tool] status: Pending
[tool] status: Completed
[tool] Create screenshots placeholder directory
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
Now run the full verification:
[tool] Full verification: typecheck, tests, build
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
All green. Now tick tasks 18–22 in tasks.md:
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
[tool] Read File
[tool] status: InProgress
[tool] status: Completed
[tool] Replace in File
[tool] status: Pending
[tool] status: Completed
Final verification pass:
[tool] Final full verification
[tool] status: InProgress
[tool] status: InProgress
[tool] status: Completed
56/56 tests, zero type errors, build clean. Here is a precise account of every change made.

---

## Changes

### (a) Wordmark — `Boot.tsx` and `Menu.tsx`

The old wordmark was 43 chars wide and only rendered `GHOST` (the last three letters `BBS` were simply absent from the string). Replaced with a 6-row × 68-column block-character wordmark that spells all eight letters. 68 columns fits comfortably inside the 80ch terminal panel. The CSS for `.wordmark` uses `white-space: pre; overflow: visible` so the characters always stay on their rows; the parent `.term-body` has `overflow-x: hidden` which clips only if the viewport is too narrow to hold 68ch (below ~550px), giving a clean fade rather than a layout break.

### (b) Share text wrapping — `styles.css`

The old `.share-text` had no width constraint, so the browser reflowed the 7-glyph lines as it saw fit. Fixed by:
- `white-space: pre` — no wrapping under any circumstances.
- `line-height: 1.0` — exactly one line per row, no inter-row gap.
- `display: block; width: 9ch` — a fixed width (7ch glyphs + ~2ch padding) that the browser treats as a sizing constraint, not a wrap point.
- The `.share-textarea` fallback gets the same `white-space: pre; line-height: 1.0; width: 10ch` treatment.

### (c) Board centering and HUD — `styles.css` and `Board.tsx`

**Centering:** Added a `.door-game-wrap` flex container (`justify-content: center` on the cross axis of `.term-body`'s column direction) that wraps the entire board block. The board itself (`door-game`) is left-aligned inside it since the grid is narrower than the panel — this gives vertical centring without stretching the grid.

**Cell sizing:** `--cell-ch: 2ch` (unchanged), `--cell-lh: 1.43` (20px ÷ 14px), `--grid-fs: 14px`. Each `.grid-cell` is `display: inline-block; width: 2ch; text-align: center`.

**HUD bullet separator:** The HUD now renders `TURN 00/30 · FRAGMENTS 3 LEFT` with an explicit `<span class="hud-sep">·</span>` between the two segments, styled in `--color-chrome-lo`. Terminal and failure states use `hud-warn` class (amber). The HUD bar has `border-bottom: none` so it merges flush into the grid frame's top border.

**Frame alignment:** The ASCII frame bars are computed as `'─'.repeat(COLS * 2)` = 14 dashes for 7 cells. Each cell is 2ch wide (one `.grid-cell`), the border chars `│` are 1ch each. The `.grid-frame` wrapper is `display: inline-block` so it shrink-wraps to exactly the grid width rather than stretching to fill the panel.

### New files

**`README.md`** — project description, screenshots table pointing at `docs/*.png`, install/dev/build/test commands, tech table, how-Kiro-was-used section (steering, spec, PostFileSave hook, headless CLI), and the reused-code notice crediting `matrixneoaiagent/nullswarm-daily` for the hash/PRNG/BFS approach.

**`docs/kiro-build-log.md`** — table of seven runs with run file, mode, purpose, and files produced.

**`docs/screenshots/.gitkeep`** — directory placeholder for future screenshot assets.

Tasks 18–22 ticked in `tasks.md`.
