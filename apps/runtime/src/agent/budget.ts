import type { ProviderMessage } from '@harness/providers';
import { AgentFailure } from './permissions';
export const CHARACTERS_PER_TOKEN = 4;
export function estimateTokens(text: string) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}
export function reportedTokens(
  usage:
    | {
        totalTokens?: number | undefined;
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
      }
    | undefined,
) {
  if (!usage) return undefined;
  if (
    typeof usage.totalTokens === 'number' &&
    Number.isFinite(usage.totalTokens)
  )
    return Math.max(0, Math.ceil(usage.totalTokens));
  if (
    typeof usage.inputTokens !== 'number' &&
    typeof usage.outputTokens !== 'number'
  )
    return undefined;
  return Math.max(
    0,
    Math.ceil((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)),
  );
}
export function contextTokens(serialized: string, reported?: number) {
  if (reported !== undefined) return reported;
  return estimateTokens(serialized);
}
function piece(value: unknown) {
  if (!value || typeof value !== 'object' || !('type' in value)) return '';
  const part = value as { type?: string; text?: string; toolName?: string };
  if (part.type === 'text' && part.text) return part.text.slice(0, 280);
  if (part.type === 'tool-call') return `tool ${part.toolName ?? ''}`.trim();
  if (part.type === 'tool-result')
    return `result ${part.toolName ?? ''}`.trim();
  return '';
}
export function summarizeTurn(messages: ProviderMessage[]) {
  const parts: string[] = [];
  for (const message of messages) {
    if (typeof message.content === 'string')
      parts.push(message.content.slice(0, 280));
    else if (Array.isArray(message.content))
      for (const part of message.content) {
        const text = piece(part);
        if (text) parts.push(text);
      }
  }
  return parts.join('\n').slice(0, 1200);
}
export function appendSummary(
  current: string,
  dropped: ProviderMessage[],
  maxChars: number,
) {
  const next = [current, summarizeTurn(dropped)].filter(Boolean).join('\n');
  return next.slice(-Math.min(12000, Math.max(256, maxChars)));
}
export function prepareContext(input: {
  prefix: ProviderMessage[];
  groups: ProviderMessage[][];
  summary: string;
  maxBytes: number;
  maxTokens: number;
  reported?: number;
}) {
  const groups = input.groups.map((group) => [...group]);
  let summary = input.summary;
  let compacted = false;
  let reported = input.reported;
  const assemble = () => {
    const messages = [...input.prefix];
    if (summary)
      messages.push({
        role: 'user',
        content: `Stored summary of earlier turns:\n${summary}`,
      });
    messages.push(...groups.flat());
    return messages;
  };
  const measure = (messages: ProviderMessage[]) => {
    const serialized = JSON.stringify(messages) ?? '';
    return {
      bytes: Buffer.byteLength(serialized),
      tokens: contextTokens(serialized, compacted ? undefined : reported),
    };
  };
  while (groups.length > 1) {
    const size = measure(assemble());
    if (size.bytes <= input.maxBytes && size.tokens <= input.maxTokens) break;
    const dropped = groups.shift();
    if (!dropped) break;
    summary = appendSummary(summary, dropped, input.maxBytes);
    compacted = true;
    reported = undefined;
  }
  const messages = assemble();
  const size = measure(messages);
  if (size.bytes > input.maxBytes || size.tokens > input.maxTokens)
    throw new AgentFailure(
      'CONTEXT_LIMIT',
      'The task exceeds its context budget. Narrow the request.',
    );
  return { messages, groups, summary, compacted, tokens: size.tokens };
}
