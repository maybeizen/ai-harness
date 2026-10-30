import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { run } from './process.mjs';
await run(process.execPath, ['tooling/prepare.mjs']);
const frontend = spawn('pnpm', ['--filter', '@harness/desktop', 'dev'], {
  stdio: 'inherit',
  detached: true,
});
let desktop;
let stopping = false;
let rebuilding = false;
let pending = false;
function start() {
  desktop = spawn(
    'pnpm',
    ['--filter', '@harness/desktop', 'tauri', 'dev', '--no-dev-server'],
    { stdio: 'inherit', detached: true },
  );
  desktop.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  desktop.on('exit', (code) => {
    if (!rebuilding && !stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}
function kill(child) {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}
function stop() {
  if (stopping) return;
  stopping = true;
  watchers.forEach((w) => w.close());
  kill(desktop);
  kill(frontend);
}
const watchers = [
  'apps/runtime/src',
  'packages/contracts/src',
  'packages/providers/src',
].map((path) =>
  watch(path, { recursive: true }, () => {
    pending = true;
    void rebuild();
  }),
);
async function rebuild() {
  if (rebuilding || stopping) return;
  rebuilding = true;
  try {
    while (pending && !stopping) {
      pending = false;
      if (desktop && desktop.exitCode === null && desktop.signalCode === null) {
        const exited = new Promise((resolve) => desktop.once('exit', resolve));
        kill(desktop);
        await exited;
      }
      await run(process.execPath, ['tooling/prepare.mjs']);
    }
    if (!stopping) start();
  } catch (error) {
    console.error(error);
    stop();
    process.exitCode = 1;
  } finally {
    rebuilding = false;
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
frontend.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
  stop();
});
frontend.on('exit', (code) => {
  if (!stopping) process.exitCode = code ?? 1;
  stop();
});
await new Promise((resolve) => setTimeout(resolve, 1500));
if (!stopping) start();
