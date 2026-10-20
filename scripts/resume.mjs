#!/usr/bin/env node
/**
 * Resume the development environment after a cold start.
 *
 * The sandbox drops `node_modules/` and `data/` between sessions (both are
 * gitignored), which leaves the preview loading a cached page while every API
 * call fails. This script repairs whatever is missing and then starts both
 * servers, so `npm run resume` is always the right thing to run.
 *
 *   npm run resume            # repair if needed, then run API + web
 *   npm run resume -- --seed  # force a fresh demo database
 */
import { existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const forceSeed = process.argv.includes('--seed');

function step(label, command, args) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

const needsInstall =
  !existsSync(path.join(root, 'node_modules')) ||
  !existsSync(path.join(root, 'node_modules', '.bin', 'vite')) ||
  !existsSync(path.join(root, 'node_modules', '.bin', 'tsx'));

if (needsInstall) {
  console.log('Dependencies are missing — installing (this happens after a sandbox reset).');
  step('Installing packages', 'npm', ['install', '--no-audit', '--no-fund']);
} else {
  console.log('✓ Dependencies present');
}

const dbFile = path.join(root, process.env.DATA_DIR || './data', 'libra.db');
if (forceSeed || !existsSync(dbFile)) {
  step('Creating the demo library', 'npm', ['run', 'seed']);
} else {
  console.log('✓ Demo database present');
}

console.log('\n▸ Starting API (4000) and website (5173) — press Ctrl+C to stop.\n');
const child = spawn('npm', ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
