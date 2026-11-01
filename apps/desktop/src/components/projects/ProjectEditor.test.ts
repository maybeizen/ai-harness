// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ProjectEditor from './ProjectEditor.vue';
const project = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Atlas',
  directoryId: null,
  instructions: '',
  preferredProvider: 'openai',
  preferredModel: 'gpt-test',
  defaultMode: 'edit',
  pinned: false,
  archived: false,
  updatedAt: 1,
};
vi.mock('../../transport/backend', () => ({
  useBackend: () => ({
    storage: (operation: { action: string }) =>
      Promise.resolve(operation.action === 'project.get' ? project : []),
    workspace: () => Promise.resolve([]),
  }),
}));
vi.mock('../../stores/chat', () => ({
  useChatStore: () => ({ refreshHistory: vi.fn() }),
}));
it('edits provider, model, and mode instead of promising them later', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ProjectEditor, {
    props: { modelValue: false, projectId: project.id },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  expect(document.body.textContent).toContain('Preferred provider');
  expect(document.body.textContent).toContain('Preferred model');
  expect(document.body.textContent).toContain('Default mode');
  expect(document.body.textContent).not.toContain('will be applied');
  const values = [...document.body.querySelectorAll('select')].map(
    (node) => node.value,
  );
  expect(values).toContain('openai');
  expect(values).toContain('edit');
  expect(
    document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Use the global model"]',
    )?.value,
  ).toBe('gpt-test');
  wrapper.unmount();
});
