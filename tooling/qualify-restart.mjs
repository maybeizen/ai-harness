import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
const sourceExecutable = resolve(
  process.argv.slice(2).find((value) => !value.startsWith('--')) ??
    'apps/desktop/src-tauri/target/release/axioden',
);
const liveMode = process.argv.includes('--live');
const output = resolve('.cache/native-restart');
mkdirSync(output, { recursive: true });
const installation = mkdtempSync(join(output, 'install-'));
const executable = join(installation, 'axioden');
cpSync(sourceExecutable, executable);
cpSync(
  resolve('.cache/node-v24.22.1-linux-x64/bin/node'),
  join(installation, 'harness-node'),
);
const runtime = join(installation, 'usr', 'lib', 'Axioden', 'runtime');
mkdirSync(runtime, { recursive: true });
await build({
  entryPoints: ['apps/runtime/src/bootstrap.ts'],
  outfile: join(runtime, 'bootstrap.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['better-sqlite3', 'node-pty', '@anthropic-ai/claude-agent-sdk'],
});
const require = createRequire(resolve('apps/runtime/package.json'));
for (const name of [
  'better-sqlite3',
  'node-pty',
  '@anthropic-ai/claude-agent-sdk',
])
  cpSync(
    dirname(
      require.resolve(
        name === '@anthropic-ai/claude-agent-sdk'
          ? name
          : `${name}/package.json`,
      ),
    ),
    join(runtime, 'node_modules', name),
    { recursive: true },
  );

const data = mkdtempSync(join(tmpdir(), 'axioden-native-'));
if (liveMode) {
  const metadata = join(
    homedir(),
    '.local/share/local.ai-harness.desktop/connections.json',
  );
  if (existsSync(metadata)) cpSync(metadata, join(data, 'connections.json'));
}
const xvfb = spawn(
  'Xvfb',
  ['-displayfd', '1', '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-ac'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
async function display() {
  return new Promise((accept, reject) => {
    let received = '';
    const deadline = setTimeout(
      () => reject(new Error('Xvfb startup timed out')),
      10000,
    );
    xvfb.once('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    xvfb.once('exit', () => {
      clearTimeout(deadline);
      reject(new Error('Xvfb stopped before qualification'));
    });
    xvfb.stdout.on('data', (chunk) => {
      received += chunk.toString();
      if (received.includes('\n')) {
        clearTimeout(deadline);
        accept(`:${received.trim()}`);
      }
    });
  });
}
async function run(stage, display) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        DISPLAY: display,
        APPDIR: installation,
        GDK_BACKEND: 'x11',
        LIBGL_ALWAYS_SOFTWARE: '1',
        HARNESS_SMOKE_DATA: data,
        HARNESS_RESTART_STAGE: stage,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    let killed = false;
    const capture = (chunk) => {
      log += chunk.toString();
      if (stage === 'crash' && log.includes('HARNESS_RESTART_RESULT:PASS')) {
        killed = true;
        child.kill('SIGKILL');
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const screenshot = setTimeout(() => {
      spawnSync(
        'import',
        [
          '-display',
          display,
          '-window',
          'root',
          join(output, `${stage}-screen.png`),
        ],
        { timeout: 5000 },
      );
    }, 5000);
    const deadline = setTimeout(() => child.kill('SIGKILL'), 25000);
    child.once('error', (error) => {
      clearTimeout(deadline);
      clearTimeout(screenshot);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(deadline);
      clearTimeout(screenshot);
      writeFileSync(join(output, `${stage}-${Date.now()}.log`), log);
      if (
        (stage === 'crash' ? killed : code === 0) &&
        (!(stage.startsWith('verify') || stage === 'live') ||
          log.includes('HARNESS_RESTART_RESULT:PASS')) &&
        !log.includes('HARNESS_RESTART_RESULT:FAIL')
      )
        accept();
      else reject(new Error(`Native ${stage} failed. See ${output}`));
    });
  });
}
try {
  const server = await display();
  if (liveMode) {
    await run('live', server);
    process.stdout.write(
      'Live provider qualification completed. See sanitized HARNESS_LIVE_REPORT logs.\n',
    );
  } else {
    await run('save', server);
    await run('verify', server);
    await run('crash', server);
    await run('verify-crash', server);
    process.stdout.write(
      'Verified native immediate-close, restart, acknowledged settings/draft persistence, and host-crash/reopen.\n',
    );
  }
} finally {
  xvfb.kill();
  rmSync(data, { recursive: true, force: true });
  rmSync(installation, { recursive: true, force: true });
}
