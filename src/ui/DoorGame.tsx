import { useState, useEffect, useCallback } from 'react';
import { generateLevel, utcDateString } from '../game/daily.js';
import { initGameState, applyMove, computeScore } from '../game/engine.js';
import { writeRun } from '../game/storage.js';
import type { GameState, Level, MoveDirection, StoredRun } from '../game/types.js';
import Board from './Board.js';

interface Props {
  handle: string;
  onDone: (run: StoredRun, level: Level) => void;
}

export default function DoorGame({ handle, onDone }: Props) {
  const [level] = useState<Level>(() => generateLevel(new Date()));
  const [gameState, setGameState] = useState<GameState>(() => initGameState(level));

  const isOver = gameState.outcome !== 'playing';

  // Write run and notify parent when terminal
  useEffect(() => {
    if (!isOver) return;
    const outcome = gameState.outcome as StoredRun['outcome'];
    const score = computeScore(
      gameState.turns,
      level.par,
      gameState.silentRun,
      outcome
    );
    const run: StoredRun = {
      utcDate: utcDateString(new Date()),
      handle,
      outcome,
      score,
      par: level.par,
      turns: gameState.turns,
      moveHistory: gameState.moveHistory,
    };
    writeRun(run);
    onDone(run, level);
  // Only fire once when the game ends
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);

  const move = useCallback((dir: MoveDirection) => {
    setGameState((prev) => applyMove(prev, dir));
  }, []);

  // Keyboard handler
  useEffect(() => {
    if (isOver) return;

    function onKey(e: KeyboardEvent) {
      const KEY_MAP: Record<string, MoveDirection> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right',
      };
      const dir = KEY_MAP[e.key];
      if (!dir) return;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      move(dir);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOver, move]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Board state={gameState} />

      {/* On-screen D-pad */}
      {!isOver && (
        <div className="dpad" aria-label="D-pad controls">
          <button className="dpad-up"    aria-label="Move Up"    onClick={() => move('up')}>▲</button>
          <button className="dpad-left"  aria-label="Move Left"  onClick={() => move('left')}>◀</button>
          <button className="dpad-right" aria-label="Move Right" onClick={() => move('right')}>▶</button>
          <button className="dpad-down"  aria-label="Move Down"  onClick={() => move('down')}>▼</button>
        </div>
      )}

      {isOver && (
        <p style={{ color: 'var(--color-chrome)', marginTop: '1em', fontSize: '0.9em' }}>
          Saving result…
        </p>
      )}
    </div>
  );
}
