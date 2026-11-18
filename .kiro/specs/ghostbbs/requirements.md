# Requirements Document

## Introduction

GHOSTBBS is a browser single-page application that presents itself as a 1980s bulletin board system still running on forgotten hardware. Players dial in through a simulated modem handshake, enter a handle, and play SPECTRE SWEEP — a daily door game on a seeded 7×7 grid. The app has no backend, makes no network calls, and persists all state in localStorage. The scope is deliberately small: around 15 source files, a single CSS file, and a pure TypeScript game engine that is completely free of DOM dependencies.

## Glossary

- **App**: The GHOSTBBS browser SPA as a whole.
- **Boot_Screen**: The initial modem handshake animation shown when the App first loads.
- **Handle_Prompt**: The text input that asks the player for their BBS handle (screen name).
- **Main_Menu**: The top-level navigation screen showing options D, M, H, and ?.
- **SPECTRE_SWEEP**: The daily door game played on a 7×7 grid.
- **Grid**: The 7×7 tile map on which SPECTRE_SWEEP is played.
- **Player**: The human-controlled character on the Grid.
- **Fragment**: One of exactly three collectible `o` tiles on a Grid; all must be collected before the hatch is reachable.
- **Hatch**: The `>` exit tile; reaching it after collecting all Fragments ends the run successfully.
- **Spectre**: An autonomous enemy that follows a fixed patrol route on the Grid; 2–3 Spectres appear per level.
- **Chebyshev_Distance**: The maximum of the absolute differences in row and column coordinates between two tiles; used to define the Spectre danger zone.
- **Caught**: The state entered when the Player ends a turn on a tile whose Chebyshev_Distance to any Spectre is ≤ 1, or when a Spectre steps onto the Player's tile.
- **Turn**: One discrete unit of time; the Player moves once, then every Spectre advances one step along its patrol route.
- **Turn_Limit**: The maximum number of Turns allowed before the run is failed; fixed at 30 Turns per level.
- **Par**: The minimum number of Turns to collect all Fragments and reach the Hatch computed by BFS over the level graph, ignoring Spectre positions.
- **Silent_Run**: A completed run in which the Player never occupied a tile within Chebyshev_Distance 2 of any Spectre at the end of any Turn.
- **Score**: A numeric value computed by the Engine from turns used, Par, and whether the run was a Silent_Run.
- **Result_Card**: The screen shown after a run ends (success or failure) displaying status, Score, Par, and the share text.
- **Share_Text**: A compact block-glyph representation of the run reproducible from stored state.
- **Leaderboard**: A locally stored list of up to 10 entries, each recording Handle, Score, date, and Par.
- **Message_Board**: A read-only screen containing 4–6 static in-fiction posts.
- **Engine**: The pure TypeScript module in `src/game/` that implements all SPECTRE_SWEEP rules; it has no DOM dependencies.
- **Storage**: The `src/game/storage.ts` module that wraps every localStorage read and write.
- **PRNG**: The seeded pseudo-random number generator (mulberry32-style) used for deterministic level generation.
- **UTC_Date**: The current date expressed as a `YYYY-MM-DD` string in UTC, used as the daily seed key.
- **Seed**: The 32-bit integer produced by `hash32("ghostbbs:" + UTC_Date)`, fed to the PRNG.
- **Fallback_Level**: A hand-authored, statically defined level guaranteed to be solvable, used when procedural generation fails.
- **CRT_Bezel**: The visual frame that encloses the 80-column terminal screen, styled to evoke a cathode-ray tube monitor.
- **Wall**: A tile on the Grid that the Player cannot enter; attempting to move into a Wall consumes one Turn without changing the Player's position.

---

## Requirements

### Requirement 1: Boot Sequence and Handle Entry

**User Story:** As a player, I want to see a modem handshake animation when I first open the app and be asked for my handle, so that the BBS fiction is established before I reach the game.

#### Acceptance Criteria

1. WHEN the App loads for the first time in a session, THE Boot_Screen SHALL display a simulated modem handshake animation lasting between 1.8 and 2.2 seconds.
2. WHEN the user activates the skip control during the Boot_Screen, THE Boot_Screen SHALL immediately terminate the animation and proceed to the Handle_Prompt.
3. WHERE `prefers-reduced-motion` is enabled in the browser, THE Boot_Screen SHALL skip the animation entirely and proceed directly to the Handle_Prompt.
4. WHEN the Boot_Screen completes, THE App SHALL display the Handle_Prompt requesting a BBS handle.
5. WHEN the player submits a handle of 1 to 20 characters at the Handle_Prompt, THE Storage SHALL persist the handle under the key `ghostbbs:v1:handle`.
6. WHEN the App loads and Storage contains a saved handle, THE App SHALL skip the Handle_Prompt and proceed directly to the Main_Menu using the saved handle.
7. IF the player submits an empty string at the Handle_Prompt, THEN THE Handle_Prompt SHALL remain displayed and show an inline error message indicating that a handle is required.
8. IF the player submits a handle exceeding 20 characters at the Handle_Prompt, THEN THE Handle_Prompt SHALL remain displayed and show an inline error message indicating the 20-character limit.

---

### Requirement 2: Main Menu Navigation

**User Story:** As a player, I want a main menu with clearly labelled keyboard shortcuts, so that I can navigate to any section of the BBS without a mouse.

#### Acceptance Criteria

1. WHEN the Main_Menu is displayed, THE App SHALL present exactly four options in this order: `[D]` Door game, `[M]` Message board, `[H]` Top scores, and `[?]` About.
2. WHEN the player presses `D` (case-insensitive) or activates the Door button, THE App SHALL navigate to SPECTRE_SWEEP and remove the Main_Menu from the display.
3. WHEN the player presses `M` (case-insensitive) or activates the Message button, THE App SHALL navigate to the Message_Board and remove the Main_Menu from the display.
4. WHEN the player presses `H` (case-insensitive) or activates the Scores button, THE App SHALL navigate to the Leaderboard and remove the Main_Menu from the display.
5. WHEN the player presses `?` or activates the About button, THE App SHALL display the About screen and remove the Main_Menu from the display.
6. THE Main_Menu SHALL render each navigable option as a `<button>` element that is reachable and activatable via Tab and Enter/Space without mouse input.
7. THE Main_Menu SHALL display the stored Handle as a non-editable label alongside the menu options.
8. IF the player has already completed SPECTRE_SWEEP for the current UTC day, THEN the Door button label SHALL indicate that the run is complete, and activating it SHALL navigate to the Result_Card for that day's run rather than starting a new game.

---

### Requirement 3: Deterministic Daily Level Generation

**User Story:** As a player, I want the same puzzle to appear for the same UTC date on every device, so that I can compare my result with others who played the same day.

#### Acceptance Criteria

1. THE Engine SHALL derive the Seed for a given UTC_Date by formatting the date as `YYYY-MM-DD` using UTC fields, concatenating it with the prefix `"ghostbbs:"` to form the string `"ghostbbs:YYYY-MM-DD"`, passing that string through `hash32` to produce a 32-bit unsigned integer, and supplying that integer as the initial state of the PRNG.
2. THE Engine SHALL accept an injected `Date` object as its sole source of the current date and SHALL NOT read the system clock directly during level generation or Spectre simulation.
3. WHEN the Engine generates a level for the same UTC_Date on two separate devices or reloads, THE Engine SHALL produce an identical Grid, identical Fragment positions, identical Hatch position, and identical Spectre patrol routes.
4. THE Engine SHALL never call `Math.random()` during level generation or Spectre simulation; the PRNG SHALL be the sole source of randomness.
5. WHEN a generated level fails BFS solvability verification, THE Engine SHALL substitute the Fallback_Level and SHALL NOT return the unsolvable level.
6. THE Engine SHALL BFS-verify every procedurally generated level before returning it.
7. THE Engine SHALL define Par as the BFS-shortest Turn count to collect all 3 Fragments and reach the Hatch, computed on the 7×7 Grid layout with Walls considered and Spectre positions ignored.
8. IF the injected `Date` object is null or undefined, THEN THE Engine SHALL throw an error indicating an invalid date parameter before attempting level generation.
9. WHEN the Engine substitutes the Fallback_Level, THE Engine SHALL still compute and return a Par value for the Fallback_Level using the same BFS procedure applied to procedurally generated levels.

---

### Requirement 4: SPECTRE SWEEP Gameplay

**User Story:** As a player, I want to move through a 7×7 grid collecting fragments and reaching the hatch while avoiding spectres, so that I have a tense, skill-testing daily puzzle to solve.

#### Acceptance Criteria

1. THE Grid SHALL be exactly 7 columns wide and 7 rows tall.
2. THE Engine SHALL place exactly 3 Fragments, 1 Hatch, and between 2 and 3 Spectres on the Grid per generated level.
3. WHEN the player presses an arrow key, `W`, `A`, `S`, or `D`, or activates an on-screen D-pad button, THE Engine SHALL attempt to move the Player one tile in that direction.
4. WHEN the player attempts to move into a tile that is outside the Grid boundary or marked as a Wall, THE Engine SHALL leave the Player in the current position and consume one Turn.
5. WHEN the Player moves onto a Fragment tile, THE Engine SHALL mark that Fragment as collected and remove it from the Grid.
6. WHEN all 3 Fragments are collected and the Player moves onto the Hatch tile, THE Engine SHALL end the run as a success.
7. WHEN the Player moves onto the Hatch tile before all 3 Fragments are collected, THE Engine SHALL treat the tile as passable but SHALL NOT end the run.
8. WHEN the Player completes a move, THE Engine SHALL advance each Spectre one step along its fixed patrol route.
9. WHEN the Player's position after a Spectre advance has a Chebyshev distance of ≤ 1 to any Spectre's position, THE Engine SHALL enter the Caught state and end the run as a failure.
10. WHEN a Spectre's patrol step places it on the Player's tile, THE Engine SHALL enter the Caught state and end the run as a failure.
11. WHEN the Turn count reaches 30 without a success or Caught condition, THE Engine SHALL end the run as a failure due to timeout.
12. WHILE a run is in progress, THE App SHALL display the current Turn count, the Turn_Limit of 30, and the number of Fragments remaining.
13. THE Engine SHALL resolve each Turn in this sequence: (1) apply the Player's move, (2) check for Fragment collection or Hatch success per criteria 5–7, (3) advance each Spectre one step per criterion 8, (4) evaluate the Caught condition per criteria 9–10, (5) increment the Turn count and check for timeout per criterion 11.

---

### Requirement 5: Scoring and Silent Run Bonus

**User Story:** As a player, I want my score to reflect both efficiency and stealth, so that finishing quickly and avoiding spectres are both rewarded.

#### Acceptance Criteria

1. WHEN a run ends successfully, THE Engine SHALL compute the Score as `max(0, (Par × 10) − (Turns − Par) × 2)`, where Turns is the number of Turns used in the run and Par is the BFS-computed Par for that level.
2. WHEN a successful run uses a Turn count at or below Par, THE Engine SHALL add 50 points to the Score.
3. WHEN a successful run is also a Silent_Run, THE Engine SHALL add an additional 30 points to the Score.
4. WHEN a run ends as a failure (Caught or timeout), THE Engine SHALL record a Score of 0.
5. THE Engine SHALL evaluate, after each Turn's Spectre advance step, whether the Player's tile is within Chebyshev_Distance 2 of any Spectre's post-advance position, and SHALL set the Silent_Run flag to false if that condition holds on any Turn.

---

### Requirement 6: One Run Per UTC Day

**User Story:** As a player, I want to play only once per UTC day, so that revisiting the app shows my result rather than allowing unlimited attempts.

#### Acceptance Criteria

1. WHEN a run ends (success or failure), THE Storage SHALL persist the run result under the key `ghostbbs:v1:run:<UTC_Date>:<Handle>`, where `<UTC_Date>` is the `YYYY-MM-DD` string and `<Handle>` is the player's stored handle.
2. WHEN the player navigates to SPECTRE_SWEEP and Storage already contains a completed run for the current UTC_Date and Handle, THE App SHALL display the Result_Card for that run instead of starting a new one.
3. THE Storage SHALL store, for each completed run, all of the following fields: UTC_Date, outcome (success or failure), Score, Par, Turns used, and the per-Turn move sequence as an ordered list of direction values sufficient to regenerate the Share_Text glyphs.

---

### Requirement 7: Result Card and Share Text

**User Story:** As a player, I want a result card after my run with a copyable block-glyph summary, so that I can share my result without spoiling the solution.

#### Acceptance Criteria

1. WHEN a run ends, THE App SHALL display the Result_Card showing: outcome (success or failure), Score, Par, Turns used, and the Share_Text.
2. THE Engine SHALL generate the Share_Text as a block-glyph grid of exactly 7 columns × 7 rows where each cell is encoded as: a filled block glyph for a tile the Player visited, a medium-shade block glyph for the Player's starting tile, and a light-shade or empty glyph for unvisited tiles; Spectre patrol routes and Fragment positions SHALL NOT appear as distinct glyphs.
3. WHEN the player activates the copy button on the Result_Card, THE App SHALL write the Share_Text to the system clipboard.
4. IF the clipboard API is unavailable, THEN THE App SHALL display the Share_Text in a visible, selectable `<textarea>` element in place of the copy button, so the player can select and copy the text manually.
5. THE Result_Card SHALL provide a real `<button>` element for the copy action.
6. WHEN the clipboard write initiated by the copy button succeeds, THE App SHALL update the copy button label to indicate success for at least 1 500 milliseconds before reverting to its original label.

---

### Requirement 8: Local Leaderboard

**User Story:** As a player, I want to see the top 10 scores stored locally, so that I have a persistent record of my best runs.

#### Acceptance Criteria

1. WHEN a run ends with a Score greater than 0 (successful run), THE Storage SHALL add an entry to the Leaderboard containing Handle, Score, UTC_Date, and Par; if an entry for the same Handle and UTC_Date already exists, THE Storage SHALL replace it only if the new Score is strictly greater.
2. THE Leaderboard SHALL retain at most 10 entries; WHEN adding an entry would cause the count to exceed 10, THE Storage SHALL remove the existing entry with the lowest Score, and if two entries share the lowest Score, THE Storage SHALL remove the one with the earlier UTC_Date.
3. WHEN the player navigates to the Leaderboard screen, THE App SHALL display all stored Leaderboard entries sorted by Score descending.
4. THE Leaderboard SHALL be stored under a key following the `ghostbbs:v1:*` namespace.
5. IF Storage is unavailable (e.g., private browsing mode), THEN THE Storage module SHALL catch the exception and THE App SHALL continue operating without crashing.

---

### Requirement 9: Static Message Board

**User Story:** As a player, I want to read a message board with in-fiction posts, so that the BBS atmosphere is deepened and I receive lore and gameplay hints.

#### Acceptance Criteria

1. THE Message_Board SHALL display between 4 and 6 static, in-fiction posts authored as sysop or user messages on the fictional BBS.
2. THE posts SHALL include at least one hint about Fragment collection and at least one piece of atmospheric lore.
3. WHEN the Message_Board content exceeds the visible area, THE App SHALL allow the player to scroll through the posts using the Up and Down arrow keys and the Page Up and Page Down keys.
4. THE Message_Board SHALL provide no mechanism for the player to post, reply, or authenticate; it is read-only.
5. THE Message_Board SHALL contain no external links and SHALL make no network requests.

---

### Requirement 10: CRT Visual Presentation

**User Story:** As a player, I want the app to look like an authentic CRT terminal, so that the BBS fiction is visually convincing.

#### Acceptance Criteria

1. THE App SHALL apply a single hand-authored CSS file for all styling; no CSS framework SHALL be used.
2. THE App SHALL use only the monospace font stack `ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace` for all text.
3. THE App SHALL define its colour palette using CSS custom properties, using phosphor-green for primary text on a near-black background, amber for warnings, and dim grey for chrome elements.
4. THE App SHALL render all frames and borders using Unicode box-drawing characters; no images SHALL be used for decorative structure.
5. THE App SHALL present all content inside an 80-column terminal screen bounded by a CRT_Bezel.
6. WHEN the viewport width is below 640 px, THE App SHALL scale the terminal screen down to fit without horizontal scrolling.
7. THE App SHALL remain usable at a viewport width of 360 px with no horizontal scrolling, where usable means all interactive elements are reachable via keyboard or tap and no content is hidden by overflow clipping.
8. WHERE `prefers-reduced-motion` is enabled, THE App SHALL disable the CRT flicker effect and the Boot_Screen animation.

---

### Requirement 11: Accessibility

**User Story:** As a player, I want to use the app entirely with a keyboard and assistive technology, so that the game is accessible regardless of motor ability or visual setup.

#### Acceptance Criteria

1. THE App SHALL provide a real `<button>` element for every interactive action, including all D-pad directions and menu items; each D-pad button SHALL carry an accessible name identifying its direction (e.g., "Move Up", "Move Down", "Move Left", "Move Right").
2. THE App SHALL show a visible focus ring on every interactive element when navigated by keyboard; the focus ring SHALL use the browser's native `:focus-visible` outline at no less than 2 px width and SHALL not be suppressed by the stylesheet.
3. THE App SHALL mark the status line (Turn count, Fragments remaining, Caught status) with `aria-live="polite"` so screen readers announce changes without interrupting ongoing speech.
4. WHEN the player presses an Arrow key or a WASD key while a run is in progress, THE App SHALL process that key as a Player move without requiring a mouse or touch input, and SHALL suppress the browser's default scroll behavior for those keys during gameplay.
5. THE App SHALL ensure that colour is never the sole means of conveying information; labels, symbols, or text alternatives SHALL accompany any colour-coded state.

---

### Requirement 12: No Network and Static Hosting Compatibility

**User Story:** As an operator, I want the app to make no runtime network calls and work from static file hosting, so that it can be served from any CDN or even a local `file://` path.

#### Acceptance Criteria

1. THE App SHALL make zero network requests at runtime.
2. THE App SHALL use relative asset paths so that it functions correctly when served from any subdirectory or via the `file://` protocol.
3. THE App SHALL set `base: './'` in `vite.config.ts` to ensure relative asset paths in the production build.
4. THE App SHALL bundle all scripts and styles into the build output with no CDN or external URL references; the App SHALL use only system fonts via the CSS font stack and SHALL reference no external font files.

---

### Requirement 13: Pure Game Engine

**User Story:** As a developer, I want the game engine to be pure TypeScript with no DOM dependencies, so that it can be unit-tested in Node without a browser environment.

#### Acceptance Criteria

1. THE Engine SHALL reside entirely within `src/game/` and SHALL import no browser or DOM APIs.
2. THE Engine SHALL expose all SPECTRE_SWEEP rules — move application, Spectre advancement, Caught detection, scoring, Share_Text generation, and level generation — as pure functions that, given identical inputs, always return identical outputs and do not read from or write to any module-level mutable variable, `window`, or global object.
3. THE App's UI layer SHALL only read Engine state and call Engine functions; it SHALL NOT implement any game rule logic directly.
4. THE Engine SHALL be importable by Vitest running in Node without requiring `jsdom` or any browser environment.

---

### Requirement 14: Persistence and Storage Safety

**User Story:** As a developer, I want all localStorage access to go through a single module wrapped in error handling, so that private browsing mode and storage quota errors never crash the app.

#### Acceptance Criteria

1. THE Storage module SHALL be the sole file that reads from or writes to localStorage; no other module SHALL call `localStorage` directly.
2. THE Storage module SHALL namespace every key with the prefix `ghostbbs:v1:`.
3. WHEN any localStorage operation throws an exception, THE Storage module SHALL catch the exception and return a safe default value or no-op rather than propagating the error.
4. THE Storage module SHALL expose typed functions for reading and writing the Handle, the current-day run result, and the Leaderboard entries; when no stored value exists or storage is unavailable, the Handle read SHALL return `null`, the run result read SHALL return `null`, and the Leaderboard read SHALL return an empty array.

---

### Requirement 15: Test Coverage of Engine

**User Story:** As a developer, I want automated tests covering the engine's core properties, so that regressions in determinism, solvability, scoring, and sharing are caught before release.

#### Acceptance Criteria

1. THE test suite SHALL include a test verifying that generating a level for the same UTC_Date twice produces identical Grids, Fragment positions, Hatch positions, and Spectre patrol routes (determinism property).
2. THE test suite SHALL include a test that generates levels for a consecutive range of at least 30 UTC dates and asserts every level is BFS-solvable (solvability property).
3. THE test suite SHALL include tests for the scoring function covering: a successful run at Par, a successful run above Par, a successful Silent_Run, and a failed run.
4. THE test suite SHALL include a test verifying that the Caught condition is triggered when and only when: (a) the Player ends a turn on a tile whose Chebyshev_Distance to any Spectre is ≤ 1, or (b) a Spectre's patrol step places it on the Player's tile.
5. THE test suite SHALL include a test verifying that the Share_Text for a fixed run input produces a stable, reproducible output string.
6. THE test suite SHALL include a test verifying that attempting a second run on the same UTC_Date returns the stored result rather than starting a new run.
7. WHEN `npm test` is executed, THE test suite SHALL run via Vitest and all tests SHALL pass; additionally, `tsc --noEmit` SHALL report zero type errors.
