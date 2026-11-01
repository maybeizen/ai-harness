import { z } from 'zod';
import type { ChatModel, ConnectionKind } from '@harness/contracts';
import { modelCapabilities } from './capabilities';
import { connectionBase } from './endpoint';
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
    input_modalities: z.array(z.string()).optional(),
    modalities: z.array(z.string()).optional(),
    supported_parameters: z.array(z.string()).optional(),
    supportedParameters: z.array(z.string()).optional(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()).optional(),
        inputModalities: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    outputTokenLimit: z.number().optional(),
    maxTemperature: z.number().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().optional(),
    max_output_tokens: z.number().optional(),
    max_completion_tokens: z.number().optional(),
    capabilities: z.unknown().optional(),
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
const official = {
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  xai: 'https://api.x.ai/v1/language-models',
  openai: 'https://api.openai.com/v1/models',
} as const;
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
    const modelId = id.replace(/^models\//, '');
    return [
      {
        id: modelId,
        name: row.display_name ?? row.displayName ?? modelId,
        verified: false,
        available: true,
        capabilities: modelCapabilities(kind, modelId, row),
      },
    ];
  });
}
function headers(kind: ConnectionKind, credential: string) {
  if (kind === 'google') return { 'x-goog-api-key': credential };
  if (kind === 'anthropic')
    return { 'x-api-key': credential, 'anthropic-version': '2023-06-01' };
  if (!credential) return {};
  return { Authorization: `Bearer ${credential}` };
}
function modelsUrl(kind: ConnectionKind, baseURL?: string) {
  if (kind === 'claude-client')
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'This connection does not use endpoint discovery.',
    });
  if (
    kind === 'google' ||
    kind === 'anthropic' ||
    kind === 'xai' ||
    kind === 'chatgpt' ||
    kind === 'openai'
  ) {
    connectionBase(kind, baseURL);
    return kind === 'chatgpt' || kind === 'openai'
      ? official.openai
      : official[kind];
  }
  const base = connectionBase(kind, baseURL);
  if (!base)
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'Enter an HTTP or HTTPS endpoint without credentials.',
    });
  return `${base}/models`;
}
export async function discoverModels(
  kind: ConnectionKind,
  credential: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  baseURL?: string,
): Promise<ChatModel[]> {
  const endpoint = modelsUrl(kind, baseURL);
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
    const response = await fetcher(url, {
      headers: headers(kind, credential),
      signal,
    });
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
