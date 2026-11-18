import { useState, useEffect } from 'react';
import { readHandle, readRun } from '../game/storage.js';
import { utcDateString } from '../game/daily.js';
import type { StoredRun, Level } from '../game/types.js';
import Boot from './Boot.js';
import Login from './Login.js';
import Menu from './Menu.js';
import DoorGame from './DoorGame.js';
import ResultCard from './ResultCard.js';
import './styles.css';

export type Screen = 'boot' | 'login' | 'menu' | 'door' | 'result';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function nowUtc(): string {
  return utcDateString(new Date());
}

// Footer key-hint depends on current screen
const HINTS: Record<Screen, string> = {
  boot:   'SPACE / click to skip',
  login:  'Enter to confirm',
  menu:   'D M H ? to navigate',
  door:   '↑↓←→ / WASD to move',
  result: 'Enter / click to continue',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const handle = readHandle();
    if (prefersReducedMotion() || handle !== null) {
      return handle !== null ? 'menu' : 'login';
    }
    return 'boot';
  });

  const [handle, setHandle] = useState<string>(() => readHandle() ?? '');

  const [currentRun, setCurrentRun] = useState<StoredRun | null>(() => {
    const h = readHandle();
    if (!h) return null;
    return readRun(nowUtc(), h);
  });

  const [resultLevel, setResultLevel] = useState<Level | null>(null);

  function onBootDone() {
    const h = readHandle();
    setScreen(h !== null ? 'menu' : 'login');
    if (h) setHandle(h);
  }

  function onLogin(newHandle: string) {
    setHandle(newHandle);
    setScreen('menu');
  }

  function onStartDoor() {
    setScreen('door');
  }

  function onViewResult() {
    const stored = readRun(nowUtc(), handle);
    setCurrentRun(stored);
    setResultLevel(null);
    setScreen('result');
  }

  function onDoorDone(run: StoredRun, level: Level) {
    setCurrentRun(run);
    setResultLevel(level);
    setScreen('result');
  }

  function onBackToMenu() {
    setScreen('menu');
  }

  useEffect(() => {
    const h = readHandle();
    if (h) setHandle(h);
  }, [screen]);

  // Breadcrumb text shown in header
  const breadcrumb: Record<Screen, string> = {
    boot:   'GHOSTBBS',
    login:  'GHOSTBBS > IDENT',
    menu:   'GHOSTBBS > MENU',
    door:   'GHOSTBBS > SPECTRE SWEEP',
    result: 'GHOSTBBS > RESULT',
  };

  return (
    <div className="terminal-panel" role="main">
      {/* ── Header bar ── */}
      <header className="term-header" aria-label="Terminal header">
        <span className="term-header-left">{breadcrumb[screen]}</span>
        <span className="term-header-right">NODE&nbsp;0x1F</span>
      </header>

      {/* ── Content area ── */}
      <main className="term-body">
        {screen === 'boot'   && <Boot onDone={onBootDone} />}
        {screen === 'login'  && <Login onLogin={onLogin} />}
        {screen === 'menu'   && (
          <Menu
            handle={handle}
            onDoor={onStartDoor}
            onResult={onViewResult}
            onBack={() => { /* top-level, no parent */ }}
          />
        )}
        {screen === 'door'   && (
          <DoorGame handle={handle} onDone={onDoorDone} />
        )}
        {screen === 'result' && currentRun && (
          <ResultCard run={currentRun} level={resultLevel} onBack={onBackToMenu} />
        )}
      </main>

      {/* ── Footer status bar ── */}
      <footer className="term-footer" aria-label="Terminal status">
        <span className="term-footer-node">ghostbbs:v1</span>
        <span className="term-footer-date">{nowUtc()}</span>
        <span className="term-footer-hints">{HINTS[screen]}</span>
      </footer>
    </div>
  );
}
