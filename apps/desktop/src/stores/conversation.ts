import {
  conversationFileSchema,
  conversationSchema,
  type ConversationFile,
  type SavedMessage,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
export async function loadConversation(
  backend: Pick<Backend, 'storage'>,
  id: string,
) {
  return conversationSchema
    .nullable()
    .parse(await backend.storage({ action: 'get', id }));
}
export function hiddenMessageIds(messages: readonly SavedMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const hidden = new Set<string>();
  for (const message of messages) {
    let parentId = message.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      hidden.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  return hidden;
}
export function visibleMessages(messages: readonly SavedMessage[]) {
  const hidden = hiddenMessageIds(messages);
  return messages.filter((message) => !hidden.has(message.id));
}
function present<T extends Record<string, unknown>>(value: T) {
  const plain = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
  return JSON.parse(JSON.stringify(plain)) as T;
}
export function chatContext(messages: readonly SavedMessage[]) {
  return visibleMessages(messages)
    .filter(
      (message) => message.role === 'user' || message.status === 'completed',
    )
    .map((message) =>
      present({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
        parentId: message.parentId,
        attachmentIds: message.attachmentIds?.length
          ? message.attachmentIds
          : undefined,
        status: message.status,
        model: message.model,
        modelName: message.modelName,
        connectionId: message.connectionId,
        reasoning: message.reasoning,
        tools: message.tools?.length ? message.tools : undefined,
      }),
    );
}
export function generationStub(message: SavedMessage) {
  return present({
    id: message.id,
    role: message.role,
    text: '',
    createdAt: message.createdAt,
    parentId: message.parentId,
    model: message.model,
    modelName: message.modelName,
    connectionId: message.connectionId,
  });
}
export async function conversationExport(
  backend: Pick<Backend, 'storage'>,
  id: string,
) {
  const conversation = await loadConversation(backend, id);
  if (!conversation) throw new Error('Conversation no longer exists.');
  const ids = [
    ...new Set(
      conversation.messages.flatMap((message) => message.attachmentIds ?? []),
    ),
  ];
  const attachments = ids.length
    ? await backend.storage({ action: 'attachment.meta', ids })
    : [];
  return conversationFileSchema.parse({
    format: 'axioden-conversation',
    version: 1,
    conversation,
    attachments,
  });
}
export function exportDocument(file: ConversationFile) {
  return JSON.stringify(file, null, 2);
}
