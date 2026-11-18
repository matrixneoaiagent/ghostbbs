import { useState } from 'react';
import { generateShareText } from '../game/engine.js';
import { generateLevel } from '../game/daily.js';
import { readScores } from '../game/storage.js';
import type { Level, StoredRun } from '../game/types.js';

interface Props {
  run: StoredRun;
  level: Level | null;
  onBack: () => void;
}

const OUTCOME_LABEL: Record<string, string> = {
  success:         '** ESCAPED **',
  failure_caught:  '!! CAUGHT !!',
  failure_timeout: '!! TIMEOUT !!',
};

const OUTCOME_FLAVOUR: Record<string, string> = {
  success:         'You made it out. The board remembers.',
  failure_caught:  'A spectre found you. The board remembers.',
  failure_timeout: 'Time expired. The board remembers.',
};

export default function ResultCard({ run, level: levelProp, onBack }: Props) {
  const level: Level = levelProp ?? generateLevel(
    new Date(run.utcDate + 'T00:00:00Z')
  );

  const outcomeShort: Record<string, string> = {
    success: 'ESCAPED', failure_caught: 'CAUGHT', failure_timeout: 'TIMEOUT',
  };
  const shareText = [
    `GHOSTBBS // SPECTRE SWEEP // ${run.utcDate}`,
    `${outcomeShort[run.outcome] ?? run.outcome.toUpperCase()} · ${run.score} pts · ${run.turns} turns · par ${run.par}`,
    generateShareText(level, run.moveHistory),
  ].join('\n');
  const scores = readScores();
  const isSuccess = run.outcome === 'success';

  const [copyLabel, setCopyLabel] = useState('[ COPY RESULT ]');

  async function handleCopy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyLabel('[ COPIED ]');
    } catch {
      setCopyLabel('[ FAILED ]');
    }
    setTimeout(() => setCopyLabel('[ COPY RESULT ]'), 1500);
  }

  const hasClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard;

  const outcomeLabel = OUTCOME_LABEL[run.outcome] ?? run.outcome.toUpperCase();
  const flavour      = OUTCOME_FLAVOUR[run.outcome] ?? '';

  // Rank of this run in the leaderboard
  const myRank = isSuccess
    ? scores.findIndex((e) => e.handle === run.handle && e.utcDate === run.utcDate) + 1
    : 0;

  return (
    <div className="result-screen">

      {/* ── Outcome banner ── */}
      <div className={`result-banner ${isSuccess ? 'success' : 'failure'}`}
           role="status" aria-live="polite">
        {outcomeLabel}
      </div>
      <p style={{ color: 'var(--color-chrome)', fontSize: '0.9em', marginBottom: '1em' }}>
        {flavour}
      </p>

      {/* ── Stats block ── */}
      <div className="result-stats" aria-label="Run statistics">
        <div>
          <span className="rk">SCORE</span>
          <span className={`rv${isSuccess && run.score > 0 ? '' : ''}`}>{run.score}</span>
        </div>
        <div>
          <span className="rk">TURNS</span>
          <span className="rv">{run.turns}</span>
          <span style={{ color: 'var(--color-chrome)' }}> / PAR </span>
          <span className="rv">{run.par}</span>
        </div>
        {isSuccess && run.turns <= run.par && (
          <div><span className="hi">★ AT OR UNDER PAR</span></div>
        )}
        {myRank > 0 && (
          <div>
            <span className="rk">RANK</span>
            <span className="rv">#{myRank}</span>
            <span style={{ color: 'var(--color-chrome)' }}> of {scores.length}</span>
          </div>
        )}
        <div>
          <span className="rk">DATE</span>
          <span className="rv">{run.utcDate}</span>
        </div>
        <div>
          <span className="rk">HANDLE</span>
          <span className="rv">{run.handle}</span>
        </div>
      </div>

      {/* ── Share / path trace ── */}
      <div className="share-block">
        <p className="share-label">PATH TRACE</p>
        <pre className="share-text" aria-label="Share text">{shareText}</pre>
        <div className="share-actions">
          {hasClipboard ? (
            <button onClick={handleCopy} aria-label="Copy share text to clipboard">
              {copyLabel}
            </button>
          ) : (
            <textarea
              className="share-textarea"
              readOnly
              rows={7}
              value={shareText}
              aria-label="Share text — select and copy manually"
            />
          )}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      {scores.length > 0 && (
        <div style={{ marginBottom: '1.2em' }}>
          <p className="result-scores-label">TOP SCORES</p>
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
                <tr key={i}
                    className={
                      entry.handle === run.handle && entry.utcDate === run.utcDate
                        ? 'self' : ''
                    }>
                  <td>{i + 1}</td>
                  <td>{entry.handle}</td>
                  <td>{entry.score}</td>
                  <td>{entry.par}</td>
                  <td>{entry.utcDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Back + goodbye ── */}
      <div className="result-goodbye">
        <button onClick={onBack} style={{ marginBottom: '0.6em' }}>
          [ RETURN TO MAIN MENU ]
        </button>
        <p style={{ marginTop: '0.5em' }}>
          Thank you for calling GHOSTBBS.
          <br />
          <span style={{ color: 'var(--color-chrome-lo)' }}>
            NO CARRIER
          </span>
        </p>
      </div>

    </div>
  );
}
