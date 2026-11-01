import { invoke } from '@tauri-apps/api/core';
import { nativeBackend } from '../transport/backend';
import {
  toAppError,
  type ChatModel,
  type ChatEvent,
  type ConnectionKind,
} from '@harness/contracts';
import type { useConnectionsStore } from '../stores/connections';
interface Result {
  connectionId: string;
  modelId: string;
  status: 'verified' | 'unverified';
  code: string;
}
async function probe(connectionId: ConnectionKind, model: ChatModel) {
  const generationId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  let cleanup: (() => void) | undefined;
  let completed = false;
  let output = '';
  let expected = 0;
  let accept!: () => void;
  let reject!: (cause: unknown) => void;
  const terminal = new Promise<void>((resolve, fail) => {
    accept = resolve;
    reject = fail;
  });
  void terminal.catch(() => undefined);
  const timer = setTimeout(
    () =>
      reject(
        Object.assign(new Error('Provider test timed out.'), {
          code: 'TIMEOUT',
        }),
      ),
    45000,
  );
  const receive = (event: ChatEvent) => {
    if (event.sequence !== expected++) {
      reject(
        Object.assign(new Error('Provider stream sequence mismatch.'), {
          code: 'UNAVAILABLE',
        }),
      );
      return;
    }
    if (event.type === 'text') {
      output += event.text;
      if (output.length > 8192)
        reject(
          Object.assign(new Error('Provider did not respect the short test.'), {
            code: 'OUTPUT_LIMIT',
          }),
        );
    } else if (event.type === 'error') reject(event.error);
    else {
      completed = true;
      if (event.status === 'completed') accept();
      else
        reject(
          Object.assign(new Error('Provider test cancelled.'), {
            code: 'CANCELLED',
          }),
        );
    }
  };
  try {
    const starting = nativeBackend.start(
      {
        generationId,
        conversationId,
        connectionId,
        modelId: model.id,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            text: 'Connectivity test. Reply with exactly AXIODEN_LIVE_OK and no other text.',
          },
        ],
      },
      receive,
    );
    // Attach immediately: failures before native authentication finishes remain handled.
    cleanup = await starting.catch((cause) => {
      reject(cause);
      throw cause;
    });
    await terminal;
    if (output.trim() !== 'AXIODEN_LIVE_OK')
      throw Object.assign(
        new Error('Provider returned a different response.'),
        { code: 'UNEXPECTED_RESPONSE' },
      );
  } finally {
    clearTimeout(timer);
    cleanup?.();
    if (!completed)
      await nativeBackend.cancel(generationId).catch(() => undefined);
    await nativeBackend
      .storage({ action: 'delete', id: conversationId })
      .catch(() => undefined);
  }
}
export async function qualifyLiveProviders(
  connections: ReturnType<typeof useConnectionsStore>,
) {
  const results: Result[] = [];
  for (const connection of connections.records.filter(
    (item) => item.configured,
  )) {
    const models =
      connections.models[connection.id]?.filter((model) => model.available) ??
      [];
    const model =
      models.find((item) => /mini|nano|flash|haiku|instant/i.test(item.id)) ??
      models[0];
    if (connection.status !== 'connected' || !model) {
      results.push({
        connectionId: connection.id,
        modelId: '',
        status: 'unverified',
        code: 'AUTH_OR_DISCOVERY_UNAVAILABLE',
      });
      continue;
    }
    try {
      await probe(connection.id, model);
      results.push({
        connectionId: connection.id,
        modelId: model.id,
        status: 'verified',
        code: 'OK',
      });
    } catch (cause) {
      const code = toAppError(cause).code;
      results.push({
        connectionId: connection.id,
        modelId: model.id,
        status: 'unverified',
        code: /^[A-Z_]{1,64}$/.test(code) ? code : 'UNAVAILABLE',
      });
    }
  }
  await invoke('qualification_live_report', { results });
  const passed =
    results.length > 0 &&
    results.every((result) => result.status === 'verified');
  await invoke('qualification_result', { passed });
  if (passed) await invoke('complete_close');
}
