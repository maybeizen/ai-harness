import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
const output = resolve('.cache/package-smoke');
mkdirSync(output, { recursive: true });
const bundles = 'apps/desktop/src-tauri/target/release/bundle/appimage';
const image = readdirSync(bundles).find((name) => name.endsWith('.AppImage'));
if (!image) throw new Error('Build an AppImage first with pnpm package');
const extraction = join(output, 'extracted');
rmSync(extraction, { recursive: true, force: true });
mkdirSync(extraction, { recursive: true });
async function capture(command, args, options, logfile, timeout = 30000) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (data) => {
    log += data.toString();
  });
  child.stderr.on('data', (data) => {
    log += data.toString();
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  try {
    const code = await new Promise((accept, reject) => {
      child.on('error', reject);
      child.on('close', accept);
    });
    writeFileSync(join(output, logfile), log);
    if (code !== 0)
      throw new Error(
        `${command} failed (${code}). See ${join(output, logfile)}`,
      );
    return log;
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}
await capture(
  resolve(bundles, image),
  ['--appimage-extract'],
  { cwd: extraction },
  'extract.log',
);
const appdir = join(extraction, 'squashfs-root');
const files = readdirSync(appdir, { recursive: true }).map(String);
const probe = files.find((file) => file.endsWith('/native-check.cjs'));
const node = files.find((file) => file.endsWith('/harness-node'));
if (!probe || !node)
  throw new Error('Packaged Node or native probe is missing');
const path = join(output, 'path');
mkdirSync(path, { recursive: true });
for (const name of [
  'sh',
  'bash',
  'tail',
  'cut',
  'dbus-send',
  'gsettings',
  'env',
  'dirname',
  'basename',
  'readlink',
  'realpath',
  'which',
  'grep',
  'sed',
  'head',
  'find',
  'ls',
  'xargs',
  'cat',
  'mkdir',
  'rm',
]) {
  const location = spawnSync('which', [name], {
    encoding: 'utf8',
  }).stdout.trim();
  if (location && !existsSync(join(path, name)))
    symlinkSync(location, join(path, name));
}
const environment = {
  ...process.env,
  PATH: path,
  LIBGL_ALWAYS_SOFTWARE: '1',
  GDK_BACKEND: 'x11',
};
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
await capture(
  join(appdir, node),
  [join(appdir, probe)],
  { env: environment },
  'native.log',
);
const xvfb = spawn(
  process.env.HARNESS_XVFB || 'Xvfb',
  ['-displayfd', '1', '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-ac'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let xvfbLog = '';
xvfb.stderr.on('data', (data) => {
  xvfbLog += data.toString();
});
try {
  const display = await new Promise((accept, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Xvfb startup timed out')),
      10000,
    );
    xvfb.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    xvfb.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(`Xvfb exited: ${xvfbLog}`));
    });
    xvfb.stdout.once('data', (data) => {
      clearTimeout(timer);
      accept(`:${data.toString().trim()}`);
    });
  });
  const data = join(output, 'data');
  rmSync(data, { recursive: true, force: true });
  const log = await capture(
    join(appdir, 'AppRun'),
    [],
    { env: { ...environment, DISPLAY: display, HARNESS_SMOKE_DATA: data } },
    'application.log',
    40000,
  );
  if (
    !log.includes('HARNESS_SMOKE_READY') ||
    !log.includes('HARNESS_SMOKE_RENDERER_READY') ||
    !log.includes('runtime.stopped')
  )
    throw new Error(
      'Packaged application did not complete handshake, renderer health, and shutdown',
    );
  const sqlite = join(data, 'harness.sqlite');
  if (!existsSync(sqlite))
    throw new Error('Packaged application did not create its database');
  // Confirm no sidecar remains from this extracted bundle.
  for (const pid of readdirSync('/proc').filter((entry) =>
    /^\d+$/.test(entry),
  )) {
    const command = spawnSync('/usr/bin/readlink', [`/proc/${pid}/exe`], {
      encoding: 'utf8',
    }).stdout.trim();
    if (command === join(appdir, node))
      throw new Error(`Packaged sidecar survived shutdown: ${pid}`);
  }
  console.log(
    `Verified AppImage, native dependencies, renderer, and shutdown. Logs: ${output}`,
  );
} finally {
  xvfb.kill();
  writeFileSync(join(output, 'xvfb.log'), xvfbLog);
}
