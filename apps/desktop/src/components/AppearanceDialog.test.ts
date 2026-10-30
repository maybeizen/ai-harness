// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, disposePinia } from 'pinia';
import { settingsSchema, type Settings } from '@harness/contracts';
import { useSettingsStore } from '../stores/settings';
import AppearanceDialog from './AppearanceDialog.vue';
const storage = vi.hoisted(() => vi.fn());
vi.mock('../transport/backend', () => ({ useBackend: () => ({ storage }) }));
it('disables appearance controls until delayed preferences hydration finishes', async () => {
  let resolve!: (settings: Settings) => void;
  storage.mockReturnValueOnce(
    new Promise<Settings>((done) => {
      resolve = done;
    }),
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useSettingsStore();
  const initialization = store.initialize();
  const wrapper = mount(AppearanceDialog, {
    props: { modelValue: true },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  try {
    await flushPromises();
    expect(document.querySelector('select')?.matches(':disabled')).toBe(true);
    resolve(settingsSchema.parse({ theme: 'light' }));
    await initialization;
    await flushPromises();
    expect(document.querySelector('select')?.matches(':disabled')).toBe(false);
    expect(store.settings.theme).toBe('light');
  } finally {
    wrapper.unmount();
    disposePinia(pinia);
  }
});
