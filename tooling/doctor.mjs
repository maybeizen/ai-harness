import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const pin = JSON.parse(
  readFileSync(new URL('./node-runtime.json', import.meta.url), 'utf8'),
);
let failed = false;
function check(name, passed, detail) {
  console.log(`${passed ? 'OK' : 'FAIL'} ${name}: ${detail}`);
  if (!passed) failed = true;
}
check('Node', process.version === `v${pin.version}`, process.version);
check(
  'platform',
  process.platform === 'linux' && process.arch === 'x64',
  `${process.platform}/${process.arch}`,
);
for (const [command, args] of [
  ['pnpm', ['--version']],
  ['rustc', ['--version']],
  ['cargo', ['--version']],
  ['git', ['--version']],
  ['cc', ['--version']],
  ['python3', ['--version']],
  ['pkg-config', ['--modversion', 'gtk+-3.0', 'webkit2gtk-4.1']],
  ['patchelf', ['--version']],
  [process.env.HARNESS_XVFB || 'Xvfb', ['-help']],
]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  check(
    command,
    result.status === 0,
    (
      result.stdout ||
      result.stderr ||
      result.error?.message ||
      'unavailable'
    ).split('\n')[0],
  );
}
process.exitCode = failed ? 1 : 0;
