// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { settingsSchema } from '@harness/contracts';
import { nativeBackend } from '../transport/backend';
import { useSettingsStore } from './settings';
vi.mock('../transport/backend', () => {
  const nativeBackend = { storage: vi.fn() };
  return { nativeBackend, useBackend: () => nativeBackend };
});
beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
});
it('restores appearance and serializes rapid writes without reactive proxy cloning errors', async () => {
  const storage = vi.mocked(nativeBackend.storage);
  storage.mockResolvedValueOnce(
    settingsSchema.parse({
      theme: 'light',
      accent: 'blue',
      sidebarOpen: false,
    }),
  );
  const store = useSettingsStore();
  await store.initialize();
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(store.settings.sidebarOpen).toBe(false);
  let release!: () => void;
  storage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(null);
      }),
  );
  storage.mockResolvedValue(null);
  const first = store.patch({ theme: 'dark' });
  const second = store.patch({ theme: 'light', reducedMotion: true });
  await Promise.resolve();
  expect(storage).toHaveBeenCalledTimes(2);
  release();
  await first;
  await second;
  expect(storage.mock.calls[1]?.[0]).toMatchObject({
    settings: { theme: 'dark' },
  });
  expect(storage.mock.calls[2]?.[0]).toMatchObject({
    settings: { theme: 'light', reducedMotion: true },
  });
  expect(document.documentElement.dataset.motion).toBe('reduced');
});
it('reports failed persistence and permits a later successful update', async () => {
  const storage = vi.mocked(nativeBackend.storage);
  storage.mockResolvedValueOnce(settingsSchema.parse({}));
  const store = useSettingsStore();
  await store.initialize();
  storage.mockRejectedValueOnce({
    code: 'STORAGE_ERROR',
    message: 'Disk is full.',
  });
  await store.patch({ accent: 'violet' });
  expect(store.error?.code).toBe('STORAGE_ERROR');
  storage.mockResolvedValueOnce(null);
  await store.patch({ accent: 'blue' });
  expect(store.error).toBeNull();
  expect(storage.mock.calls.at(-1)?.[0]).toMatchObject({
    settings: { accent: 'blue' },
  });
});
it('does not overwrite invalid persisted settings with defaults', async () => {
  const storage = vi.mocked(nativeBackend.storage);
  storage.mockResolvedValue({ theme: 'invalid', apiKey: 'untrusted' });
  const store = useSettingsStore();
  await store.initialize();
  expect(store.ready).toBe(false);
  expect(store.error).not.toBeNull();
  await store.patch({ theme: 'light' });
  expect(storage).toHaveBeenCalledTimes(1);
});
