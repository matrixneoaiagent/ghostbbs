# GHOSTBBS — tech steering

- **Stack:** Vite 7 + React 19 + TypeScript (strict), Vitest for unit tests. No router,
  no state library, no CSS framework, no icon package.
- **Styling:** one hand-written CSS file. Monospace stack only
  (`ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace`).
  Phosphor-green on near-black, amber for warnings, dim grey for chrome. CSS variables
  for the palette. Box-drawing characters for frames, never images.
- **Layout:** an 80-column "screen" inside a CRT bezel; below 640 px it scales down and
  keeps the same character grid. No horizontal scrolling at 360 px.
- **Determinism:** the puzzle for a UTC date must be identical on every device. Seeded
  PRNG (mulberry32-style) fed by `hash32("ghostbbs:" + date)`; never use `Math.random()`
  in level generation or simulation. `Date` is injected/parameterised so tests can pin it.
- **Purity:** `src/game/*` is framework-free TypeScript with no DOM access; the UI only
  renders state and dispatches moves. All game rules live in the pure engine.
- **Correctness rule:** every generated day must be BFS-verified solvable before it is
  returned; keep a hand-built fallback level so generation can never ship a dead board.
- **Persistence:** localStorage keys are namespaced `ghostbbs:v1:*`. All reads/writes go
  through `src/game/storage.ts`, wrapped in try/catch (private mode must not crash).
- **Accessibility:** real buttons for every action, visible focus rings, `aria-live` for
  the status line, keyboard play, and `prefers-reduced-motion` disabling the flicker and
  the boot animation. Colour is never the only signal.
- **No network:** zero runtime fetches. The app must work from `file://`-style static
  hosting with relative asset paths (`base: './'`).
- **Tests:** engine tests cover determinism, solvability over a date range, scoring,
  caught detection, share text and the one-run-per-day rule. UI tests are out of scope;
  `tsc --noEmit` plus the build covers the rest.
