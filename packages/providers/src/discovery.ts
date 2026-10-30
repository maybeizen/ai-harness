import { z } from 'zod';
import type { ChatModel, ConnectionKind } from '@harness/contracts';
import { httpFailure, ProviderFailure } from './errors';
const rowSchema = z
  .object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().optional(),
    display_name: z.string().optional(),
    displayName: z.string().optional(),
    visibility: z.string().optional(),
    supportedGenerationMethods: z.array(z.string()).optional(),
    supported_actions: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    modalities: z.array(z.string()).optional(),
    shutdown_date: z.string().nullable().optional(),
  })
  .passthrough();
const pageSchema = z
  .object({
    data: z.array(rowSchema).optional(),
    models: z.array(rowSchema).optional(),
    has_more: z.boolean().optional(),
    last_id: z.string().optional(),
    nextPageToken: z.string().optional(),
  })
  .passthrough();
export function parseModels(kind: ConnectionKind, data: unknown): ChatModel[] {
  const page = pageSchema.parse(data);
  return (page.models ?? page.data ?? []).flatMap((row) => {
    const id = row.slug ?? row.id ?? row.name;
    if (!id) return [];
    if (kind === 'chatgpt' && row.visibility !== 'list') return [];
    if (
      kind === 'google' &&
      (!row.supportedGenerationMethods?.includes('generateContent') ||
        /image|tts|audio|robotics|computer-use/i.test(id))
    )
      return [];
    if (
      kind === 'openai' &&
      (!/^(gpt-|chatgpt-|o[1-9])/.test(id) ||
        /audio|realtime|transcribe|tts|image|search|instruct|codex|deep-research/.test(
          id,
        ))
    )
      return [];
    if (row.shutdown_date && Date.parse(row.shutdown_date) <= Date.now())
      return [];
    if (
      kind === 'xai' &&
      row.output_modalities &&
      !row.output_modalities.includes('text')
    )
      return [];
    return [
      {
        id: id.replace(/^models\//, ''),
        name:
          row.display_name ?? row.displayName ?? id.replace(/^models\//, ''),
        verified: false,
        available: true,
      },
    ];
  });
}
export async function discoverModels(
  kind: ConnectionKind,
  credential: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatModel[]> {
  const endpoint =
    kind === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta/models'
      : kind === 'anthropic'
        ? 'https://api.anthropic.com/v1/models'
        : kind === 'xai'
          ? 'https://api.x.ai/v1/language-models'
          : 'https://api.openai.com/v1/models';
  const headers: Record<string, string> =
    kind === 'google'
      ? { 'x-goog-api-key': credential }
      : kind === 'anthropic'
        ? { 'x-api-key': credential, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${credential}` };
  const models: ChatModel[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(endpoint);
    if (kind === 'anthropic') url.searchParams.set('limit', '100');
    if (cursor)
      url.searchParams.set(
        kind === 'google' ? 'pageToken' : 'after_id',
        cursor,
      );
    const response = await fetcher(url, { headers, signal });
    if (!response.ok) throw httpFailure(response.status);
    const body: unknown = await response.json();
    const parsed = pageSchema.parse(body);
    models.push(...parseModels(kind, body));
    const next =
      parsed.nextPageToken ?? (parsed.has_more ? parsed.last_id : undefined);
    if (!next) break;
    if (next === cursor)
      throw new ProviderFailure({
        code: 'NETWORK',
        message: 'The provider returned an invalid model list.',
      });
    cursor = next;
  }
  return [...new Map(models.map((model) => [model.id, model])).values()];
}
