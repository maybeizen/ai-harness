import { defineStore } from 'pinia';
import { ref, watch, onScopeDispose } from 'vue';
import {
  settingsSchema,
  toAppError,
  type Settings,
  type AppError,
} from '@harness/contracts';
import { useBackend } from '../transport/backend';
export const useSettingsStore = defineStore('settings', () => {
  const backend = useBackend();
  const settings = ref<Settings>(settingsSchema.parse({}));
  const ready = ref(false);
  const error = ref<AppError | null>(null);
  let queue = Promise.resolve();
  let media: MediaQueryList | undefined;
  function apply() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme =
      settings.value.theme === 'system'
        ? media?.matches
          ? 'dark'
          : 'light'
        : settings.value.theme;
    root.dataset.accent = settings.value.accent;
    root.dataset.density = settings.value.density;
    root.dataset.motion = settings.value.reducedMotion ? 'reduced' : 'full';
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
    const snapshot = settingsSchema.parse(settings.value);
    queue = queue.then(async () => {
      try {
        await backend.storage({ action: 'settings.set', settings: snapshot });
        error.value = null;
      } catch (cause) {
        error.value = toAppError(cause);
      }
    });
    return queue;
  }
  watch(settings, apply);
  onScopeDispose(() => media?.removeEventListener('change', apply));
  return { settings, ready, error, initialize, patch };
});
