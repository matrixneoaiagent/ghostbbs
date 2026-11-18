import type { GameState } from '../game/types.js';

interface Props {
  state: GameState;
}

// Glyph rendered for each base tile type
const TILE_GLYPH: Record<string, string> = {
  floor:    '·',
  wall:     '#',
  fragment: 'o',
  hatch:    '>',
};

// CSS class — .t-* names
const TILE_CLASS: Record<string, string> = {
  floor:    't-floor',
  wall:     't-wall',
  fragment: 't-fragment',
  hatch:    't-hatch',
  player:   't-player',
  spectre:  't-spectre',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export default function Board({ state }: Props) {
  const { level, playerPos, remainingFragments, spectreIndices } = state;
  const COLS = level.grid[0].length; // 7

  // Build render grid: start from base tiles, then overlay actors
  const cells: Array<Array<{ glyph: string; cls: string }>> = level.grid.map(
    (row) => row.map((tile) => ({ glyph: TILE_GLYPH[tile] ?? '?', cls: TILE_CLASS[tile] ?? '' }))
  );

  // Overlay remaining fragments
  for (const frag of remainingFragments) {
    cells[frag.row][frag.col] = { glyph: 'o', cls: 't-fragment' };
  }

  // Collected fragment cells revert to floor
  for (const frag of level.fragmentCells) {
    const stillThere = remainingFragments.some(
      (r) => r.row === frag.row && r.col === frag.col
    );
    if (!stillThere) {
      const hasActor =
        (playerPos.row === frag.row && playerPos.col === frag.col) ||
        spectreIndices.some((idx, i) => {
          const sp = level.spectreRoutes[i][idx];
          return sp.row === frag.row && sp.col === frag.col;
        });
      if (!hasActor) {
        cells[frag.row][frag.col] = { glyph: '·', cls: 't-floor' };
      }
    }
  }

  // Overlay spectres
  spectreIndices.forEach((idx, i) => {
    const sp = level.spectreRoutes[i][idx];
    cells[sp.row][sp.col] = { glyph: 'S', cls: 't-spectre' };
  });

  // Overlay player (top priority)
  cells[playerPos.row][playerPos.col] = { glyph: '@', cls: 't-player' };

  // ── HUD ──
  const fragsLeft = remainingFragments.length;

  // Turn/status segment
  let turnSegment: React.ReactNode;
  let fragSegment: React.ReactNode = null;

  if (state.outcome === 'success') {
    turnSegment = <span className="hud-val">ESCAPED</span>;
  } else if (state.outcome === 'failure_caught') {
    turnSegment = <span className="hud-warn">CAUGHT</span>;
  } else if (state.outcome === 'failure_timeout') {
    turnSegment = <span className="hud-warn">TIMEOUT</span>;
  } else {
    turnSegment = (
      <>
        <span className="hud-val">TURN {pad2(state.turns)}/30</span>
        <span className="hud-sep">·</span>
        <span className={fragsLeft === 0 ? 'hud-val' : ''}>
          FRAGMENTS {fragsLeft === 0 ? 'ALL FOUND' : `${fragsLeft} LEFT`}
        </span>
      </>
    );
    fragSegment = null; // already included above
  }

  // ── ASCII frame ──
  // Each cell renders as one .grid-cell (width: 2ch) so grid inner width = COLS * 2ch.
  // The frame borders (│) are each 1ch. We draw top/bottom bars matching that width.
  // Inner character count for the bar: COLS * 2 dashes (one per ch of each cell)
  const innerDashes = COLS * 2; // 14 dashes for 7 cells
  const hBar      = '─'.repeat(innerDashes);
  const topBar    = `┌${hBar}┐`;
  const bottomBar = `└${hBar}┘`;

  return (
    <div className="door-game-wrap">
      <div className="door-game">

        {/* ── HUD bar (flush above grid frame) ── */}
        <div className="hud-bar" aria-live="polite" aria-atomic="true">
          {turnSegment}
          {fragSegment}
        </div>

        {/* ── Grid with ASCII border frame ── */}
        <div className="grid-frame">
          <pre className="grid-pre" aria-label="Game grid" role="img">
            {/* Top border */}
            <span className="t-wall" style={{ display: 'block' }}>{topBar}</span>

            {/* Rows */}
            {cells.map((row, r) => (
              <span key={r} style={{ display: 'block' }}>
                <span className="t-wall">│</span>
                {row.map((cell, c) => (
                  <span key={c} className={`grid-cell ${cell.cls}`}>{cell.glyph}</span>
                ))}
                <span className="t-wall">│</span>
              </span>
            ))}

            {/* Bottom border */}
            <span className="t-wall" style={{ display: 'block' }}>{bottomBar}</span>
          </pre>
        </div>

        {/* ── Legend ── */}
        <p className="grid-hint" aria-hidden="true">
          <span className="t-player">@</span> you{' · '}
          <span className="t-fragment">o</span> fragment{' · '}
          <span className="t-hatch">{'>'}</span> hatch{' · '}
          <span className="t-spectre">S</span> spectre{' · '}
          <span className="t-wall">#</span> wall
        </p>

      </div>
    </div>
  );
}
