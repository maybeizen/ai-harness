import { expect, it, vi } from 'vitest';
import { windowGeometrySchema } from '@harness/contracts';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
import { restoreSavedWindow } from './window-state';
const saved = windowGeometrySchema.parse({
  x: 10,
  y: 20,
  width: 1100,
  height: 760,
  maximized: false,
});
it('restores through the native clamp and ignores an empty window', async () => {
  const restore = vi.fn(() => Promise.resolve({ ...saved, x: 0 }));
  expect(await restoreSavedWindow(null, restore)).toBeNull();
  expect(restore).not.toHaveBeenCalled();
  await expect(restoreSavedWindow(saved, restore)).resolves.toMatchObject({
    x: 0,
    maximized: false,
  });
  restore.mockResolvedValueOnce({ ...saved, width: 10 });
  await expect(restoreSavedWindow(saved, restore)).rejects.toThrow();
});
