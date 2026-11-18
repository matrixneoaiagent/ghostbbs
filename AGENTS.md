# GHOSTBBS agent notes

Kiro runs headless in this repo. Every Kiro invocation is logged in
`docs/kiro-build-log.md` with the exact prompt and the credit reading before/after.

- Spec lives in `.kiro/specs/ghostbbs/`. Implement tasks in order, tick them in
  `tasks.md`, and keep the engine (`src/game/`) free of DOM imports.
- After edits, `node node_modules/typescript/bin/tsc --noEmit` must pass. The
  PostFileSave hook does this automatically and writes `.kiro/hook-log.txt`.
- Do not add npm dependencies. Do not fetch anything at runtime.
- Copy is terse and in-fiction: the board is dead, the sysop is not.
