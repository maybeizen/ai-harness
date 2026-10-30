import { rmSync } from 'node:fs';
import { run } from './process.mjs';
await run(process.execPath, ['tooling/build.mjs', '--frontend-only']);
// Tauri reuses AppDir and appimage_deb staging; obsolete native binaries must not survive.
rmSync('apps/desktop/src-tauri/target/release/bundle', {
  recursive: true,
  force: true,
});
await run(
  'pnpm',
  [
    '--filter',
    '@harness/desktop',
    'tauri',
    'build',
    '--bundles',
    'appimage',
    '--verbose',
  ],
  { env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } },
);
