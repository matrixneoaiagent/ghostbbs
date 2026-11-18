import type { StoredRun, LeaderboardEntry } from './types.js';

const PREFIX = 'ghostbbs:v1:';

// --- Handle ---

export function readHandle(): string | null {
  try {
    const v = localStorage.getItem(PREFIX + 'handle');
    return v;
  } catch {
    return null;
  }
}

export function writeHandle(handle: string): void {
  try {
    localStorage.setItem(PREFIX + 'handle', handle);
  } catch {
    // silent no-op in private mode or quota exceeded
  }
}

// --- Run ---

function runKey(utcDate: string, handle: string): string {
  return `${PREFIX}run:${utcDate}:${handle}`;
}

export function readRun(utcDate: string, handle: string): StoredRun | null {
  try {
    const v = localStorage.getItem(runKey(utcDate, handle));
    if (v === null) return null;
    return JSON.parse(v) as StoredRun;
  } catch {
    return null;
  }
}

export function writeRun(run: StoredRun): void {
  try {
    // One run per day: only overwrite if new score is strictly greater
    const existing = readRun(run.utcDate, run.handle);
    if (existing !== null && run.score <= existing.score) return;

    localStorage.setItem(runKey(run.utcDate, run.handle), JSON.stringify(run));

    // Update leaderboard for successful (score > 0) runs
    if (run.score > 0) {
      _addToLeaderboard({
        handle: run.handle,
        score: run.score,
        utcDate: run.utcDate,
        par: run.par,
      });
    }
  } catch {
    // silent no-op
  }
}

// --- Scores ---

export function readScores(): LeaderboardEntry[] {
  try {
    const v = localStorage.getItem(PREFIX + 'scores');
    if (v === null) return [];
    return JSON.parse(v) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

export function writeScores(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(PREFIX + 'scores', JSON.stringify(entries));
  } catch {
    // silent no-op
  }
}

// --- Internal leaderboard eviction ---

function _addToLeaderboard(incoming: LeaderboardEntry): void {
  let entries = readScores();

  // Replace same handle+date only if new score is strictly greater
  const existingIdx = entries.findIndex(
    (e) => e.handle === incoming.handle && e.utcDate === incoming.utcDate
  );
  if (existingIdx !== -1) {
    if (incoming.score <= entries[existingIdx].score) return;
    entries = entries.filter((_, i) => i !== existingIdx);
  }

  entries = [...entries, incoming];

  // Evict entries beyond cap of 10
  while (entries.length > 10) {
    // Find the entry with the lowest score; ties broken by earlier utcDate
    let evictIdx = 0;
    for (let i = 1; i < entries.length; i++) {
      const e = entries[i];
      const best = entries[evictIdx];
      if (
        e.score < best.score ||
        (e.score === best.score && e.utcDate < best.utcDate)
      ) {
        evictIdx = i;
      }
    }
    entries = entries.filter((_, i) => i !== evictIdx);
  }

  // Sort descending by score; equal scores by utcDate descending (most recent first)
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.utcDate < a.utcDate ? -1 : b.utcDate > a.utcDate ? 1 : 0;
  });

  writeScores(entries);
}
