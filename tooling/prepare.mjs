import { build } from 'esbuild';
import {
  cpSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
  chmodSync,
  mkdtempSync,
  renameSync,
  readdirSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const pin = JSON.parse(readFileSync('tooling/node-runtime.json', 'utf8'));
if (
  process.version !== `v${pin.version}` ||
  process.platform !== 'linux' ||
  process.arch !== 'x64'
)
  throw new Error('Use the pinned Node version on Linux x86_64');
mkdirSync('.cache', { recursive: true });
const archive = `.cache/node-v${pin.version}-${pin.platform}.tar.xz`;
if (!existsSync(archive)) {
  await run('curl', [
    '-fL',
    '--retry',
    '3',
    `https://nodejs.org/dist/v${pin.version}/node-v${pin.version}-${pin.platform}.tar.xz`,
    '-o',
    archive,
  ]);
}
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
if (digest !== pin.sha256) throw new Error('Node archive checksum mismatch');
const stage = mkdtempSync(resolve('.cache/node-stage-'));
try {
  await run('tar', ['-xJf', archive, '-C', stage]);
  const base = 'apps/desktop/src-tauri';
  mkdirSync(`${base}/binaries`, { recursive: true });
  cpSync(
    `${stage}/node-v${pin.version}-${pin.platform}/bin/node`,
    `${base}/binaries/harness-node-x86_64-unknown-linux-gnu.tmp`,
  );
  renameSync(
    `${base}/binaries/harness-node-x86_64-unknown-linux-gnu.tmp`,
    `${base}/binaries/harness-node-x86_64-unknown-linux-gnu`,
  );
  chmodSync(`${base}/binaries/harness-node-x86_64-unknown-linux-gnu`, 0o755);
  // Do not delete other profile installations while a developer app is running.
  const output = `${base}/resources/runtime`;
  mkdirSync(output, { recursive: true });
  await build({
    entryPoints: {
      bootstrap: 'apps/runtime/src/bootstrap.ts',
      'native-check': 'apps/runtime/src/integrations/native-check.ts',
    },
    outdir: output,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['better-sqlite3', 'node-pty', '@anthropic-ai/claude-agent-sdk'],
    sourcemap: true,
  });
  const require = createRequire(resolve('apps/runtime/package.json'));
  for (const name of ['better-sqlite3', 'node-pty']) {
    const source = dirname(require.resolve(`${name}/package.json`));
    const destination = join(output, 'node_modules', name);
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    for (const part of [
      'package.json',
      'lib',
      'prebuilds',
      'build/Release',
      'LICENSE',
      'LICENSE-MIT',
    ]) {
      if (existsSync(join(source, part)))
        cpSync(join(source, part), join(destination, part), {
          recursive: true,
          filter: (path) => {
            if (path.includes('obj.target')) return false;
            const relative = path.slice(source.length + 1);
            if (!relative.startsWith('prebuilds/')) return true;
            const target = relative.split('/')[1];
            return target === 'linux-x64.node' || target === 'linux-x64';
          },
        });
    }
  }
  const sdkSource = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'));
  const sdkDestination = join(
    output,
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk',
  );
  rmSync(sdkDestination, { recursive: true, force: true });
  mkdirSync(sdkDestination, { recursive: true });
  for (const file of readdirSync(sdkSource)) {
    if (
      file.endsWith('.mjs') ||
      file.endsWith('.js') ||
      file === 'package.json' ||
      file.startsWith('manifest') ||
      file.startsWith('README') ||
      file.startsWith('LICENSE')
    )
      cpSync(join(sdkSource, file), join(sdkDestination, file));
  }
  cpSync(
    `${stage}/node-v${pin.version}-${pin.platform}/LICENSE`,
    `${output}/NODE-LICENSE`,
  );
  await run(`${base}/binaries/harness-node-x86_64-unknown-linux-gnu`, [
    `${output}/native-check.cjs`,
  ]);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
