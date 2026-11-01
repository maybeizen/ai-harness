// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageComposer from './MessageComposer.vue';
import { useChatStore } from '../../stores/chat';
it('offers attachments and restores focus on the message field', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(MessageComposer, {
    global: {
      plugins: [pinia],
      stubs: {
        Tooltip: { template: '<div><slot /></div>' },
        TooltipTrigger: { template: '<div><slot /></div>' },
        TooltipContent: { template: '<div><slot /></div>' },
      },
    },
    attachTo: document.body,
  }) as { unmount: () => void };
  useChatStore().pending.push({
    id: 'a'.repeat(64),
    name: 'shot.png',
    mediaType: 'image/png',
    size: 8,
  });
  await nextTick();
  const file = document.body.querySelector('input[type="file"]');
  const field = document.body.querySelector('textarea');
  expect(file).toBeInstanceOf(HTMLInputElement);
  expect(document.body.textContent).toContain('does not list vision');
  field?.focus();
  expect(document.activeElement).toBe(field);
  wrapper.unmount();
});
