// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { TooltipProvider } from '../ui/tooltip';
import MessageTurn from './MessageTurn.vue';
import type { ChatMessage } from '../../stores/chat';
const reply: ChatMessage = {
  id: 'assistant',
  role: 'assistant',
  text: 'Done',
  status: 'completed',
  createdAt: 1_700_000_000_000,
  reasoning: 'Checked the file.',
  modelName: 'Test',
  tools: [
    {
      callId: 'call-1',
      name: 'read_file',
      status: 'completed',
      input: '{"path":"src/main.ts"}',
      output: 'contents',
    },
  ],
};
const Harness = defineComponent({
  components: { TooltipProvider, MessageTurn },
  props: {
    message: { type: Object, required: true },
    canRegenerate: { type: Boolean, required: true },
    canRetry: { type: Boolean, required: true },
  },
  template: `<TooltipProvider><MessageTurn :message="message" :attachments="[]" :can-edit="false" :can-regenerate="canRegenerate" :can-retry="canRetry" /></TooltipProvider>`,
});
it('shows reasoning, a file reference, and regenerate only when they apply', async () => {
  const wrapper = mount(Harness, {
    props: { message: reply, canRegenerate: true, canRetry: false },
  });
  const turn = wrapper.getComponent(MessageTurn);
  expect(turn.get('details summary').text()).toContain('Reasoning');
  expect(turn.text()).toContain('src/main.ts');
  expect(turn.text()).toContain('Regenerate');
  expect(turn.text()).not.toContain('Retry');
  await turn.get('button[class*="h-7"]').trigger('click');
  expect(turn.emitted('regenerate')).toHaveLength(1);
  await wrapper.setProps({
    message: { ...reply, reasoning: undefined, tools: undefined },
    canRegenerate: false,
    canRetry: true,
  });
  expect(turn.find('summary').exists()).toBe(false);
  expect(turn.text()).toContain('Retry');
});
