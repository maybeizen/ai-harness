import type { ModelMessage } from 'ai';
import type { TextMessage } from '@harness/contracts';
export interface PromptImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  data: string;
}
function attached(
  message: TextMessage,
  images: Readonly<Record<string, readonly PromptImage[]>>,
  vision: boolean,
) {
  if (!vision || message.role !== 'user') return undefined;
  const parts = images[message.id];
  return parts?.length ? parts : undefined;
}
export function modelMessages(
  messages: readonly TextMessage[],
  images: Readonly<Record<string, readonly PromptImage[]>>,
  vision: boolean,
): ModelMessage[] {
  return messages.map((message) => {
    const parts = attached(message, images, vision);
    if (!parts) return { role: message.role, content: message.text };
    return {
      role: 'user',
      content: [
        { type: 'text', text: message.text },
        ...parts.map((image) => ({
          type: 'file' as const,
          data: image.data,
          mediaType: image.mediaType,
        })),
      ],
    };
  });
}
export function responsesInput(
  messages: readonly TextMessage[],
  images: Readonly<Record<string, readonly PromptImage[]>>,
  vision: boolean,
  context: string,
) {
  return [
    ...(context ? [{ role: 'system' as const, content: context }] : []),
    ...messages.map((message) => {
      const parts = attached(message, images, vision);
      if (!parts) return { role: message.role, content: message.text };
      return {
        role: message.role,
        content: [
          { type: 'input_text' as const, text: message.text },
          ...parts.map((image) => ({
            type: 'input_image' as const,
            image_url: `data:${image.mediaType};base64,${image.data}`,
          })),
        ],
      };
    }),
  ];
}
