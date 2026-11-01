import { invoke, isTauri } from '@tauri-apps/api/core';
import { windowGeometrySchema, type WindowGeometry } from '@harness/contracts';
export async function restoreSavedWindow(
  geometry: WindowGeometry | null,
  restore: (geometry: WindowGeometry) => Promise<unknown> = (value) =>
    invoke('restore_window', { geometry: value }),
) {
  if (!geometry || !isTauri()) return null;
  return windowGeometrySchema.parse(await restore(geometry));
}
export async function readWindowGeometry(
  capture: () => Promise<unknown> = () => invoke('capture_window'),
) {
  if (!isTauri()) return null;
  return windowGeometrySchema.parse(await capture());
}
