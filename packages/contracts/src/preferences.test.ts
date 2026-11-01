import { describe, expect, it } from 'vitest';
import {
  appearanceSettingsSchema,
  backgroundSchema,
  settingsSchema,
  themePresetSchema,
} from './preferences';
describe('appearance preferences', () => {
  it('migrates old settings additively with bounded defaults', () => {
    const saved = settingsSchema.parse({
      selectedProvider: 'openai',
      selectedModel: 'saved-model',
      theme: 'light',
    });
    expect(saved).toMatchObject({
      theme: 'light',
      selectedModel: 'saved-model',
      fontScale: 1,
      sidebarWidth: 248,
      chatWidth: 768,
      customText: null,
      background: { assetId: null, opacity: 0.25 },
      fontFamily: 'system',
      window: null,
      retention: {
        preserveActiveConversation: true,
        confirmBeforeDelete: true,
      },
    });
    expect(
      appearanceSettingsSchema.parse({ density: 'spacious' }).density,
    ).toBe('spacious');
  });
  it('rejects unsafe colors, layout values and background paths', () => {
    for (const candidate of [
      { customAccent: 'url(https://outside.invalid)' },
      { customText: '#fff' },
      { fontScale: 10 },
      { sidebarWidth: -1 },
      { chatWidth: 10000 },
      { borderIntensity: 1.1 },
    ])
      expect(settingsSchema.safeParse(candidate).success).toBe(false);
    expect(backgroundSchema.safeParse({ assetId: '../secret' }).success).toBe(
      false,
    );
    expect(backgroundSchema.safeParse({ opacity: 2 }).success).toBe(false);
    expect(backgroundSchema.safeParse({ blur: 31 }).success).toBe(false);
    expect(
      backgroundSchema.parse({
        assetId: 'a8f1e5b0-07f3-40e7-b63e-b3b079bef9d8',
      }).assetId,
    ).toBeTruthy();
  });
  it('accepts only appearance values in portable theme files', () => {
    const preset = {
      format: 'axioden-theme',
      version: 1,
      appearance: { theme: 'light' },
    };
    expect(themePresetSchema.parse(preset).appearance.customAccent).toBeNull();
    expect(
      themePresetSchema.safeParse({ ...preset, apiKey: 'not-permitted' })
        .success,
    ).toBe(false);
    expect(
      themePresetSchema.safeParse({
        ...preset,
        appearance: { selectedProvider: 'openai' },
      }).success,
    ).toBe(false);
    expect(
      themePresetSchema.safeParse({
        ...preset,
        appearance: { background: { assetId: 'private' } },
      }).success,
    ).toBe(false);
    expect(themePresetSchema.safeParse({ ...preset, version: 2 }).success).toBe(
      false,
    );
  });
});
