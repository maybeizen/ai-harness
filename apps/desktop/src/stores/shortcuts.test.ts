// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { settingsSchema } from '@harness/contracts';
import { nativeBackend } from '../transport/backend';
import { useSettingsStore } from './settings';
import { useShortcutsStore, recordShortcut } from './shortcuts';
vi.mock('../transport/backend', () => {
  const nativeBackend = { storage: vi.fn() };
  return { nativeBackend, useBackend: () => nativeBackend };
});
beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
});
async function setup() {
  vi.mocked(nativeBackend.storage)
    .mockResolvedValueOnce(settingsSchema.parse({}))
    .mockResolvedValue(null);
  const preferences = useSettingsStore();
  await preferences.initialize();
  return useShortcutsStore();
}
it('matches portable bindings on either platform without accepting extra modifiers or composition', async () => {
  const store = await setup();
  expect(
    store.match(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true })),
  ).toBe('newChat');
  expect(
    store.match(new KeyboardEvent('keydown', { key: 'N', metaKey: true })),
  ).toBe('newChat');
  expect(
    store.match(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true }),
    ),
  ).toBeNull();
  expect(
    store.match(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, repeat: true }),
    ),
  ).toBeNull();
  expect(
    store.match(
      new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        isComposing: true,
      }),
    ),
  ).toBeNull();
  expect(store.match(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(
    'cancel',
  );
});
it('records shifted punctuation portably and rejects conflicting changes before persistence', async () => {
  const store = await setup();
  expect(
    recordShortcut(
      new KeyboardEvent('keydown', {
        key: '+',
        code: 'Equal',
        ctrlKey: true,
        shiftKey: true,
      }),
    ),
  ).toBe('CtrlOrMeta+Shift+=');
  expect(await store.set('focusComposer', 'CtrlOrMeta+N')).toBe(false);
  expect(store.error).toContain('New conversation');
  expect(nativeBackend.storage).toHaveBeenCalledTimes(1);
  expect(
    store.record(new KeyboardEvent('keydown', { key: 'q', ctrlKey: true })),
  ).toBeNull();
  expect(store.error).toContain('reserved');
});
it('persists custom bindings and disabling, and detects conflicts during individual reset', async () => {
  const store = await setup();
  expect(await store.set('newChat', null)).toBe(true);
  expect(
    store.match(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true })),
  ).toBeNull();
  expect(await store.set('focusComposer', 'CtrlOrMeta+N')).toBe(true);
  await store.reset('newChat');
  expect(store.error).toContain('conflicts');
  expect(store.bindings.newChat).toBeNull();
  await store.reset();
  expect(store.bindings.newChat).toBe('CtrlOrMeta+N');
  expect(store.bindings.focusComposer).toBe('CtrlOrMeta+J');
  expect(vi.mocked(nativeBackend.storage).mock.calls.at(-1)?.[0]).toMatchObject(
    {
      action: 'settings.set',
      settings: { shortcuts: { newChat: 'CtrlOrMeta+N' } },
    },
  );
});

it('surfaces save failures for reset instead of reporting unsaved defaults as saved', async () => {
  const store = await setup();
  vi.mocked(nativeBackend.storage).mockRejectedValue({
    code: 'STORAGE_ERROR',
    message: 'Disk full.',
  });
  await store.reset();
  expect(store.error).toContain('could not be saved');
});
