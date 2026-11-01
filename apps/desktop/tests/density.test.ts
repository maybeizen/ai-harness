// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { applyAppearance } from '../src/stores/appearance';
it('density changes sidebar row height and shell spacing, and font reaches the shell', () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/styles/controls.css'),
    'utf8',
  );
  const compact = css.slice(css.indexOf("data-density='compact'"));
  const spacious = css.slice(css.indexOf("data-density='spacious'"));
  expect(compact).toContain('--sidebar-row-height: 1.625rem');
  expect(compact).toContain('--shell-gap: 0.375rem');
  expect(spacious).toContain('--sidebar-row-height: 2.75rem');
  expect(spacious).toContain('--shell-gap: 1.25rem');
  applyAppearance(
    settingsSchema.parse({ fontFamily: 'serif', density: 'compact' }),
  );
  expect(document.documentElement.dataset.font).toBe('serif');
  expect(document.documentElement.dataset.density).toBe('compact');
  expect(
    document.documentElement.style.getPropertyValue('--shell-font'),
  ).toContain('Georgia');
});
