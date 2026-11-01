import { it, expect } from 'vitest';
import {
  normalizeShortcut,
  shortcutBindingsSchema,
  shortcutPresetSchema,
} from './shortcuts';
it('normalizes modifier order and rejects reserved or typing-only bindings', () => {
  expect(normalizeShortcut('Shift+CtrlOrMeta+k')).toBe('CtrlOrMeta+Shift+K');
  for (const value of [
    'CtrlOrMeta+Q',
    'Alt+F4',
    'F5',
    'Ctrl+Shift+R',
    'Meta+Space',
    'A',
    'Shift+A',
    'Ctrl+Ctrl+A',
    'Super+J',
  ])
    expect(() => normalizeShortcut(value)).toThrow();
});
it('detects overlapping platform-specific and portable bindings', () => {
  expect(
    shortcutBindingsSchema.safeParse({ focusComposer: 'Ctrl+N' }).success,
  ).toBe(false);
  expect(
    shortcutBindingsSchema.safeParse({ focusComposer: 'Meta+N' }).success,
  ).toBe(false);
  expect(
    shortcutBindingsSchema.safeParse({
      newChat: null,
      focusComposer: 'CtrlOrMeta+N',
    }).success,
  ).toBe(true);
  expect(shortcutBindingsSchema.parse({}).cancel).toBe('Escape');
});
it('rejects unknown action names and unsupported preset versions', () => {
  expect(
    shortcutBindingsSchema.safeParse({ arbitraryCommand: 'CtrlOrMeta+X' })
      .success,
  ).toBe(false);
  expect(
    shortcutPresetSchema.safeParse({
      format: 'axioden-shortcuts',
      version: 2,
      shortcuts: {},
    }).success,
  ).toBe(false);
});
