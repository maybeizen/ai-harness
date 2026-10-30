import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { discoverModels, streamChat } from '@harness/providers';
import type { ConnectionKind, GenerationInput } from '@harness/contracts';
import { claudeModels, claudeStream } from './claude';
export interface RuntimeAuth {
  credential?: string | undefined;
  executable?: string | undefined;
}
export function chatService(directory: string) {
  const clientDirectory = join(directory, 'claude-chat');
  mkdirSync(clientDirectory, { recursive: true, mode: 0o700 });
  return {
    models: (kind: ConnectionKind, auth: RuntimeAuth) =>
      kind === 'claude-client'
        ? claudeModels(auth.executable ?? '', clientDirectory)
        : discoverModels(
            kind,
            auth.credential ?? '',
            AbortSignal.timeout(20000),
          ),
    stream: (
      input: GenerationInput,
      auth: RuntimeAuth,
      controller: AbortController,
    ) =>
      input.connectionId === 'claude-client'
        ? claudeStream(
            auth.executable ?? '',
            clientDirectory,
            input.modelId,
            input.messages,
            controller,
          )
        : streamChat(
            input.connectionId,
            input.modelId,
            input.messages,
            auth.credential ?? '',
            controller.signal,
          ),
  };
}
export type ChatService = ReturnType<typeof chatService>;
