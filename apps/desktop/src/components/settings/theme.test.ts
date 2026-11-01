import { it, expect } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { exportTheme, importTheme, contrastRatio } from './theme';
it('round-trips appearance without exporting private selection or asset references', () => {
  const settings = settingsSchema.parse({
    selectedModel: 'private-model',
    activeConversation: 'private-conversation',
    customAccent: '#38A595',
    background: { assetId: 'private-background' },
  });
  const exported = exportTheme(settings);
  expect(exported).not.toContain('private-');
  expect(importTheme(exported)).toMatchObject({
    customAccent: '#38A595',
    density: 'comfortable',
  });
  expect(() =>
    importTheme(exported.replace('"version": 1', '"version": 100')),
  ).toThrow();
  expect(() => importTheme('{')).toThrow();
  expect(() => importTheme(' '.repeat(65537))).toThrow('64 KiB');
});
it('computes text contrast without treating low contrast customization as safe', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  expect(contrastRatio('#444444', '#444444')).toBe(1);
  expect(contrastRatio('#F8FAFC', '#202833')).toBeGreaterThan(4.5);
  expect(contrastRatio('#15181E', '#EDF0F4')).toBeGreaterThan(4.5);
});
