import { it, expect } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { exportSettings, importSettings } from './settings-transfer';
it('exports portable settings without private conversation or background references', () => {
  const current = settingsSchema.parse({
    selectedModel: 'model-one',
    activeConversation: 'private-chat',
    background: { assetId: 'private-image' },
    fontScale: 1.15,
  });
  const exported = exportSettings(current);
  expect(exported).not.toContain('private-');
  expect(importSettings(exported)).toMatchObject({
    selectedModel: 'model-one',
    fontScale: 1.15,
    shortcuts: { newChat: 'CtrlOrMeta+N' },
  });
  expect({ ...current, ...importSettings(exported) }.background.assetId).toBe(
    'private-image',
  );
});
it('rejects credentials, local assets, malformed settings and conflicting shortcuts', () => {
  const valid = JSON.parse(exportSettings(settingsSchema.parse({}))) as {
    format: string;
    version: number;
    settings: Record<string, unknown>;
  };
  for (const settings of [
    { ...valid.settings, apiKey: 'untrusted' },
    { ...valid.settings, background: { assetId: 'foreign' } },
    { ...valid.settings, shortcuts: { focusComposer: 'Ctrl+N' } },
    { ...valid.settings, fontScale: 10 },
  ])
    expect(() =>
      importSettings(JSON.stringify({ ...valid, settings })),
    ).toThrow();
  expect(() => importSettings('{')).toThrow();
  expect(() => importSettings(' '.repeat(262145))).toThrow('256 KiB');
});
