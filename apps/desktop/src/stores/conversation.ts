import { conversationSchema, type SavedMessage } from '@harness/contracts';
import type { Backend } from '../transport/backend';
export async function loadConversation(backend: Backend, id: string) {
  return conversationSchema
    .nullable()
    .parse(await backend.storage({ action: 'get', id }));
}
export async function copyConversationExport(backend: Backend, id: string) {
  const conversation = await loadConversation(backend, id);
  if (!conversation) throw new Error('Conversation no longer exists.');
  await backend.copy(
    JSON.stringify(
      { format: 'ai-harness-conversation', version: 1, conversation },
      null,
      2,
    ),
  );
}

export function chatContext(messages: SavedMessage[], user: SavedMessage) {
  return [
    ...messages.filter(
      (message) => message.role === 'user' || message.status === 'completed',
    ),
    user,
  ].map(({ id, role, text }) => ({ id, role, text }));
}
