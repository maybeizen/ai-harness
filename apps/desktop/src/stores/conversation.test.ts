import { expect, it } from 'vitest';
import type { SavedMessage } from '@harness/contracts';
import { chatContext, hiddenMessageIds, visibleMessages } from './conversation';
const user: SavedMessage = {
  id: 'user',
  role: 'user',
  text: 'Question',
  status: 'completed',
};
const failed: SavedMessage = {
  id: 'failed',
  role: 'assistant',
  text: 'Broke',
  status: 'error',
};
const retry: SavedMessage = {
  id: 'retry',
  role: 'assistant',
  text: '',
  status: 'streaming',
  parentId: 'failed',
};
it('hides earlier variants and leaves them out of the next prompt', () => {
  const messages = [user, failed, retry];
  expect([...hiddenMessageIds(messages)]).toEqual(['failed']);
  expect(visibleMessages(messages).map((message) => message.id)).toEqual([
    'user',
    'retry',
  ]);
  expect(chatContext(messages).map((message) => message.id)).toEqual(['user']);
});
