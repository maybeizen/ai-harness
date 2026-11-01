import { mkdirSync, cpSync } from 'node:fs';
import { run } from './process.mjs';
mkdirSync('.cache', { recursive: true });
await run(process.execPath, ['tooling/prepare.mjs']);
await run('pnpm', ['--filter', '@harness/desktop', 'build']);
if (!process.argv.includes('--frontend-only')) {
  await run('cargo', [
    'build',
    '--release',
    '--features',
    'custom-protocol',
    '--locked',
    '--manifest-path',
    'apps/desktop/src-tauri/Cargo.toml',
  ]);

  cpSync(
    'apps/desktop/src-tauri/resources/runtime',
    'apps/desktop/src-tauri/target/release/runtime',
    { recursive: true },
  );
  cpSync(
    'apps/desktop/src-tauri/binaries/harness-node-x86_64-unknown-linux-gnu',
    'apps/desktop/src-tauri/target/release/harness-node',
  );
}
