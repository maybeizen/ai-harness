import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { toAppError, type AppError } from '@harness/contracts';
import { useSettingsStore } from './settings';
export const useBackgroundStore = defineStore('background', () => {
  const preferences = useSettingsStore();
  const dataUrl = ref<string | null>(null);
  const error = ref<AppError | null>(null);
  const busy = ref(false);
  let revision = 0;
  let pending: Promise<void> = Promise.resolve();
  async function load() {
    const current = ++revision;
    const id = preferences.settings.background.assetId;
    if (!id) {
      dataUrl.value = null;
      return;
    }
    try {
      const url = await invoke<string>('read_background', { id });
      if (revision === current) {
        dataUrl.value = url;
        error.value = null;
      }
    } catch (cause) {
      if (revision === current) {
        dataUrl.value = null;
        error.value = toAppError(cause);
      }
    }
  }
  async function performImport(file: File) {
    if (busy.value) return;
    if (file.size > 8 * 1024 * 1024) {
      error.value = {
        code: 'INVALID_REQUEST',
        message: 'Choose an image smaller than 8 MiB.',
      };
      return;
    }
    busy.value = true;
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const id = await invoke<string>('import_background', { bytes });
      const previous = preferences.settings.background.assetId;
      await preferences.patch({
        background: { ...preferences.settings.background, assetId: id },
      });
      await preferences.flush();
      await load();
      if (previous) await invoke('remove_background', { id: previous });
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = false;
    }
  }
  async function performRemove() {
    if (busy.value) return;
    busy.value = true;
    try {
      const previous = preferences.settings.background.assetId;
      await preferences.patch({
        background: { ...preferences.settings.background, assetId: null },
      });
      await preferences.flush();
      ++revision;
      dataUrl.value = null;
      if (previous) await invoke('remove_background', { id: previous });
      error.value = null;
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = false;
    }
  }
  function importImage(file: File) {
    pending = performImport(file);
    return pending;
  }
  function remove() {
    pending = performRemove();
    return pending;
  }
  async function flush() {
    await pending;
  }
  return { dataUrl, error, busy, load, importImage, remove, flush };
});
