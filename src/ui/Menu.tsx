import { useState, useEffect, useRef } from 'react';
import { readRun, readScores } from '../game/storage.js';
import { utcDateString } from '../game/daily.js';
import type { LeaderboardEntry } from '../game/types.js';

type SubView = 'none' | 'messages' | 'scores' | 'about';

interface Props {
  handle: string;
  onDoor: () => void;
  onResult: () => void;
  onBack: () => void;
}

// Full GHOSTBBS wordmark — 6 rows × 68 cols, fits 80ch terminal
// Spells G-H-O-S-T-B-B-S in box-drawing block characters.
const WORDMARK = `\
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗██████╗ ██████╗ ███████╗
 ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝
 ██║  ███╗███████║██║   ██║███████╗   ██║   ██████╔╝██████╔╝███████╗ 
 ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ██╔══██╗██╔══██╗╚════██║ 
 ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ██████╔╝██████╔╝███████║ 
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═════╝ ╚═════╝ ╚══════╝`;

const POSTS = [
  {
    id: 1,
    from: 'SYSOP',
    date: '1994-08-12',
    subject: 'Board status',
    body:
      'If you are reading this, the board is still up. I am not.\n' +
      'Hardware has been running since 1991. Do not power it down.',
  },
  {
    id: 2,
    from: 'WRAITHNET',
    date: '1993-11-04',
    subject: 'Re: SPECTRE SWEEP tips',
    body:
      'Fragments glow faint. Move toward them before the sweep timer runs.\n' +
      'The hatch does nothing until all three are in your hands.\n' +
      'Watch the corners — that is where they like to start.',
  },
  {
    id: 3,
    from: 'PHOSPHOR',
    date: '1993-07-22',
    subject: 'Silent run',
    body:
      "Stayed two tiles clear the entire board last night. 190 points.\n" +
      "The spectres' routes are fixed. Learn the cycle.",
  },
  {
    id: 4,
    from: 'SYSOP',
    date: '1992-03-15',
    subject: 'Daily seed',
    body:
      'Puzzle changes at UTC midnight. Same seed every device.\n' +
      'No second chances. One run per day.',
  },
  {
    id: 5,
    from: 'DEADLINK',
    date: '1992-01-30',
    subject: 'Is anyone else still on here?',
    body: '...',
  },
];

export default function Menu({ handle, onDoor, onResult, onBack: _onBack }: Props) {
  const [subView, setSubView] = useState<SubView>('none');
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  const today = utcDateString(new Date());
  const todayRun = readRun(today, handle);
  const hasRun = todayRun !== null;

  useEffect(() => {
    if (subView === 'scores') setScores(readScores());
  }, [subView]);

  // Main-menu keyboard shortcuts
  useEffect(() => {
    if (subView !== 'none') return;
    function onKey(e: KeyboardEvent) {
      const k = e.key.toUpperCase();
      if (k === 'D') { hasRun ? onResult() : onDoor(); }
      else if (k === 'M') setSubView('messages');
      else if (k === 'H') setSubView('scores');
      else if (k === '?') setSubView('about');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subView, hasRun, onDoor, onResult]);

  // Escape from sub-views
  useEffect(() => {
    if (subView === 'none') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSubView('none');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subView]);

  // Message-board keyboard scroll
  useEffect(() => {
    if (subView !== 'messages') return;
    function onKey(e: KeyboardEvent) {
      const el = boardRef.current;
      if (!el) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); el.scrollBy(0,  40); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); el.scrollBy(0, -40); }
      if (e.key === 'PageDown')  { e.preventDefault(); el.scrollBy(0, 200); }
      if (e.key === 'PageUp')    { e.preventDefault(); el.scrollBy(0,-200); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subView]);

  /* ── Sub-views ── */

  if (subView === 'messages') {
    return (
      <div className="menu-screen">
        <div className="subview-header">MESSAGE BOARD — {POSTS.length} messages</div>
        <div className="message-board" ref={boardRef} tabIndex={0}>
          {POSTS.map((post) => (
            <div key={post.id} className="message">
              <div className="message-meta">
                <span>#{post.id}</span>
                {'  '}<span className="author">{post.from}</span>
                {'  '}{post.date}{'  '}—{'  '}{post.subject}
              </div>
              <pre className="message-body">{post.body}</pre>
            </div>
          ))}
        </div>
        <div className="back-row">
          <button onClick={() => setSubView('none')}>[ BACK ]</button>
          <span className="back-hint">↑↓ PgUp PgDn · Esc</span>
        </div>
      </div>
    );
  }

  if (subView === 'scores') {
    return (
      <div className="menu-screen">
        <div className="subview-header">TOP SCORES — LOCAL LEADERBOARD</div>
        <div>
          {scores.length === 0 ? (
            <p style={{ color: 'var(--color-chrome)' }}>No scores recorded yet.</p>
          ) : (
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>HANDLE</th>
                  <th>SCORE</th>
                  <th>PAR</th>
                  <th>DATE</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((entry, i) => (
                  <tr key={i} className={entry.handle === handle ? 'self' : ''}>
                    <td>{i + 1}</td>
                    <td>{entry.handle}</td>
                    <td>{entry.score}</td>
                    <td>{entry.par}</td>
                    <td>{entry.utcDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="back-row">
          <button onClick={() => setSubView('none')}>[ BACK ]</button>
        </div>
      </div>
    );
  }

  if (subView === 'about') {
    return (
      <div className="menu-screen">
        <div className="subview-header">ABOUT GHOSTBBS</div>
        <div className="about-body">
          <p>
            GHOSTBBS has been running since 1991. The sysop has not been seen since
            1994. The hardware keeps answering.
          </p>
          <p>
            SPECTRE SWEEP is the only surviving door game. One puzzle per UTC day,
            same seed on every device. Collect the three fragments, reach the hatch.
            Avoid the spectres. No second chances.
          </p>
          <p>
            Scores stored locally in your browser. No network calls. No accounts.
          </p>
          <p style={{ color: 'var(--color-chrome)' }}>
            ghostbbs:v1 · static SPA · no backend · no CDN
          </p>
        </div>
        <div className="back-row">
          <button onClick={() => setSubView('none')}>[ BACK ]</button>
        </div>
      </div>
    );
  }

  /* ── Main menu ── */
  return (
    <div className="menu-screen">
      <pre className="wordmark" aria-label="GHOSTBBS">{WORDMARK}</pre>

      <p className="menu-handle">
        Connected as: <span className="handle-val">{handle}</span>
      </p>

      <div className="menu-box">
        <div className="menu-box-title">MAIN MENU</div>
        <nav className="menu-options" aria-label="Main menu">
          <button onClick={() => { hasRun ? onResult() : onDoor(); }}>
            <span className="key">[D]</span>
            {' '}{hasRun ? 'SPECTRE SWEEP — view result' : 'SPECTRE SWEEP — play'}
          </button>
          <button onClick={() => setSubView('messages')}>
            <span className="key">[M]</span> Message board
          </button>
          <button onClick={() => setSubView('scores')}>
            <span className="key">[H]</span> Top scores
          </button>
          <button onClick={() => setSubView('about')}>
            <span className="key">[?]</span> About
          </button>
        </nav>
      </div>

      <p style={{ color: 'var(--color-chrome)', fontSize: '0.85em' }}>
        Press key or click.
      </p>
    </div>
  );
}
