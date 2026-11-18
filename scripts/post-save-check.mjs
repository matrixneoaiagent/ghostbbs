#!/usr/bin/env node
// PostFileSave hook: typecheck the workspace after the agent writes a source file.
// Reads the Kiro hook event (JSON) on stdin, appends a one-line receipt to
// .kiro/hook-log.txt, and exits non-zero only if the typecheck fails.
import { appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

let event = {};
try {
  const raw = await new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('timeout', () => resolve(buf));
  });
  event = raw.trim() ? JSON.parse(raw) : {};
} catch {
  event = {};
}

const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();
const file = typeof event.file_path === 'string' ? event.file_path : '(unknown)';
const tsc = join(cwd, 'node_modules', 'typescript', 'bin', 'tsc');
const stamp = new Date().toISOString();

let verdict = 'tsc skipped (no local typescript)';
if (existsSync(tsc)) {
  try {
    execFileSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    });
    verdict = 'tsc clean';
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.toString();
    const firstError = out.split('\n').find((line) => /error TS\d+/.test(line));
    verdict = `tsc FAILED: ${firstError ?? 'unknown error'}`.slice(0, 240);
  }
}

const relative = file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
appendFileSync(
  join(cwd, '.kiro', 'hook-log.txt'),
  `${stamp}  PostFileSave  ${relative}  ->  ${verdict}\n`
);
process.stderr.write(`[hook] ${verdict}\n`);
process.exit(verdict.startsWith('tsc FAILED') ? 1 : 0);
