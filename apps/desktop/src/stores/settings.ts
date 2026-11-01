import { defineStore } from 'pinia';
import { ref, watch, onScopeDispose } from 'vue';
import {
  settingsSchema,
  toAppError,
  type Settings,
  type AppError,
} from '@harness/contracts';
import { useBackend } from '../transport/backend';
import { applyAppearance } from './appearance';
export const useSettingsStore = defineStore('settings', () => {
  const backend = useBackend();
  const settings = ref<Settings>(settingsSchema.parse({}));
  const ready = ref(false);
  const error = ref<AppError | null>(null);
  let queue = Promise.resolve();
  let dirty = false;
  let media: MediaQueryList | undefined;
  function apply() {
    if (typeof document === 'undefined') return;
    applyAppearance(settings.value, media?.matches ?? true);
  }
  async function initialize() {
    try {
      settings.value = settingsSchema.parse(
        await backend.storage({ action: 'settings.get' }),
      );
      ready.value = true;
      error.value = null;
      media?.removeEventListener('change', apply);
      if (typeof matchMedia !== 'undefined') {
        media = matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', apply);
      }
      apply();
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  function patch(update: Partial<Settings>) {
    settings.value = settingsSchema.parse({ ...settings.value, ...update });
    apply();
    if (!ready.value) return Promise.resolve();
    dirty = true;
    const snapshot = settingsSchema.parse(settings.value);
    queue = queue.then(async () => {
      try {
        await backend.storage({ action: 'settings.set', settings: snapshot });
        error.value = null;
        dirty = false;
      } catch (cause) {
        error.value = toAppError(cause);
      }
    });
    return queue;
  }
  async function flush() {
    if (!ready.value)
      throw Object.assign(
        new Error(error.value?.message ?? 'Preferences have not loaded.'),
        { code: error.value?.code ?? 'STORAGE_ERROR' },
      );
    let current: Promise<void>;
    do {
      current = queue;
      await current;
    } while (current !== queue);
    if (dirty || error.value) {
      await patch({});
      if (error.value || dirty)
        throw Object.assign(
          new Error(error.value?.message ?? 'Preferences could not be saved.'),
          { code: error.value?.code ?? 'STORAGE_ERROR' },
        );
    }
  }
  watch(settings, apply);
  onScopeDispose(() => media?.removeEventListener('change', apply));
  return { settings, ready, error, initialize, patch, flush };
});
