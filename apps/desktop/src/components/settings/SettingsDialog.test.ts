// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { useConnectionsStore } from '../../stores/connections';
import { useSettingsStore } from '../../stores/settings';
import SettingsDialog from './SettingsDialog.vue';
vi.mock('../../transport/backend', () => ({
  useBackend: () => ({
    storage: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    workspace: vi.fn().mockResolvedValue([]),
    health: vi.fn(),
    open: vi.fn(),
  }),
}));
vi.mock('../../transport/workstation', () => ({
  workstation: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));
beforeEach(() => {
  document.body.replaceChildren();
});
async function openDialog() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SettingsDialog, {
    props: { modelValue: true },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return { pinia, wrapper };
}
it('filters settings pages and shows the terminal sandbox fact', async () => {
  const { pinia, wrapper } = await openDialog();
  try {
    const search = document.querySelector(
      'input[aria-label="Search settings"]',
    ) as HTMLInputElement;
    search.value = 'terminal sandbox';
    search.dispatchEvent(new Event('input'));
    await flushPromises();
    expect(document.body.textContent).toContain('Terminal');
    expect(document.body.textContent).not.toContain('Keyboard shortcuts');
    const terminal = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Terminal'),
    );
    terminal?.click();
    await flushPromises();
    expect(document.body.textContent).toContain('not a filesystem sandbox');
  } finally {
    wrapper.unmount();
    disposePinia(pinia);
  }
});
it('hides generation controls the selected model does not support', async () => {
  const { pinia, wrapper } = await openDialog();
  try {
    const preferences = useSettingsStore();
    preferences.settings = settingsSchema.parse({ selectedMode: 'edit' });
    const connections = useConnectionsStore();
    connections.selected = 'openai';
    connections.modelId = 'fixture';
    connections.models.openai = [
      {
        id: 'fixture',
        name: 'Fixture',
        verified: false,
        available: true,
        capabilities: {
          tools: 'unknown',
          images: 'unknown',
          structuredOutput: 'unknown',
          temperature: 'unsupported',
          reasoningEffort: 'unsupported',
          maxOutputTokens: 'unsupported',
        },
      },
    ];
    const search = document.querySelector(
      'input[aria-label="Search settings"]',
    ) as HTMLInputElement;
    search.value = 'agent';
    search.dispatchEvent(new Event('input'));
    await flushPromises();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Agent'))
      ?.click();
    await flushPromises();
    expect(document.body.textContent).toContain(
      'Edit can read and apply approved file writes, edits, deletes, and patches.',
    );
    search.value = 'models temperature';
    search.dispatchEvent(new Event('input'));
    await flushPromises();
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Models'))
      ?.click();
    await flushPromises();
    expect(document.body.textContent).toContain('stay hidden');
    expect(document.querySelector('input[type="number"]')).toBeNull();
    connections.models.openai = [
      {
        ...connections.models.openai[0]!,
        capabilities: {
          tools: 'unknown',
          images: 'unknown',
          structuredOutput: 'unknown',
          temperature: 'supported',
        },
      },
    ];
    await flushPromises();
    expect(document.querySelector('input[type="number"]')).not.toBeNull();
  } finally {
    wrapper.unmount();
    disposePinia(pinia);
  }
});
