import { beforeAll, afterAll, it, expect } from 'vitest';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
const directory = mkdtempSync(join(tmpdir(), 'harness-runtime-'));
const script = join(directory, 'bootstrap.cjs');
beforeAll(async () => {
  const require = createRequire(resolve('apps/runtime/package.json'));
  await build({
    entryPoints: ['apps/runtime/src/bootstrap.ts'],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'cjs',

    plugins: [
      {
        name: 'native',
        setup(builder) {
          builder.onResolve(
            { filter: /^(better-sqlite3|@anthropic-ai\/claude-agent-sdk)$/ },
            ({ path }) => ({
              path: require.resolve(path),
              external: true,
            }),
          );
        },
      },
    ],
  });
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it('starts, handshakes, rejects invalid requests, and shuts down without a surviving process', async () => {
  const child = spawn(process.execPath, [script], {
    env: { PATH: process.env['PATH'], HARNESS_DATA_DIR: directory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
  const lines = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ]();
  try {
    child.stdin.write('{"version":2,"id":"hello-1","method":"hello"}\n');
    const first = await lines.next();
    if (first.done)
      throw new Error(`Runtime exited before handshake: ${stderr}`);
    expect(JSON.parse(first.value)).toMatchObject({
      id: 'hello-1',
      ok: true,
      result: { storage: 'ready' },
    });
    child.stdin.write('invalid\n');
    expect(JSON.parse((await lines.next()).value as string)).toMatchObject({
      ok: false,
    });
    const exit = new Promise((resolve) => child.once('exit', resolve));
    child.stdin.write('{"version":2,"id":"stop-1","method":"shutdown"}\n');
    expect(JSON.parse((await lines.next()).value as string)).toMatchObject({
      id: 'stop-1',
      ok: true,
    });
    await expect(exit).resolves.toBe(0);
    expect(() => process.kill(child.pid!, 0)).toThrow();
  } finally {
    clearTimeout(timer);
    child.kill();
  }
});
it('exits when the host closes stdin', async () => {
  const child = spawn(process.execPath, [script], {
    env: { PATH: process.env['PATH'], HARNESS_DATA_DIR: directory },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.end();
  try {
    await expect(exit).resolves.toBe(0);
  } finally {
    child.kill();
  }
});
