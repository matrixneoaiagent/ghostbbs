# GHOSTBBS — product steering

GHOSTBBS is a **resurrected 1980s bulletin board system** that you can actually log
into and play. It is a browser SPA (no backend). The fiction: a sysop's machine that
was never powered down; the board still answers the phone at 1200 baud, and its only
surviving door game, **SPECTRE SWEEP**, is still running.

## Audience and tone

- Players who remember BBS door games, ANSI art and `ATDT`; plus people who never saw one.
- Tone: dry, eerie, affectionate. Deadpan sysop announcements. No exclamation-mark hype.
- All copy is short enough to fit an 80x25 terminal screen.

## Core loop (scope is deliberately small)

1. **Dial in** — short modem handshake animation (~2 s, skippable, respects
   `prefers-reduced-motion`). Then a handle prompt (persisted in localStorage).
2. **Main menu** — `[D]` door game, `[M]` message board, `[H]` top scores, `[?]` about.
3. **SPECTRE SWEEP** — the daily door game:
   - 7x7 grid, one room per day, seeded from the **UTC date**.
   - Collect all 3 `o` fragments, then reach the `>` hatch, before the turn limit.
   - 2–3 spectres patrol fixed routes; ending your move on a cell within Chebyshev
     distance 1 of a spectre (or letting one step onto you) ends the run.
   - Arrow keys / WASD / on-screen D-pad. One move = one turn.
   - Score rewards finishing at or under **par** (BFS-computed shortest safe route),
     plus a bonus for never getting within distance 2 ("silent run").
4. **Result card** — status line, score, par, a shareable block-glyph summary and a
   copy button. One run per UTC day per browser; revisiting shows the result.
5. **Leaderboard** — localStorage only, top 10 handles with score, date and par.
6. Message board: 4–6 static in-fiction posts (lore, hints about fragments), readable
   and scrollable. No posting, no accounts, no network calls.

## Non-goals

No backend, no auth, no analytics, no paid services, no images/fonts fetched from a CDN,
no sound autoplay, no infinite content. The whole app must stay under ~15 source files
and load instantly on a phone.

## Definition of done

`npm test` and `npm run build` pass; the app is playable with keyboard only; the daily
seed is deterministic across reloads and machines; the share text is copyable; the
layout works at 360 px wide.
