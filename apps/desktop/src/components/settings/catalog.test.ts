import { expect, it } from 'vitest';
import { filterSettingsPages, settingsPages } from './catalog';
it('search matches every term against page labels and keywords', () => {
  expect(
    filterSettingsPages(settingsPages, '  Terminal sandbox ').map(
      (page) => page.id,
    ),
  ).toEqual(['terminal']);
  expect(filterSettingsPages(settingsPages, 'missing-page')).toEqual([]);
  expect(filterSettingsPages(settingsPages, '').length).toBe(
    settingsPages.length,
  );
});
