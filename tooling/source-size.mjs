import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = 'apps/desktop/src-tauri/src';
for (const name of readdirSync(root, { recursive: true })) {
  if (
    !name.endsWith('.rs') ||
    name.endsWith('_tests.rs') ||
    name.endsWith('/tests.rs')
  )
    continue;
  const lines = readFileSync(join(root, name), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('//'));
  if (lines.length > 300)
    throw new Error(`${name} exceeds 300 production source lines`);
}
