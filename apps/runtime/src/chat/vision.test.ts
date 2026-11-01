import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  generationControlFlags,
  type GenerationInput,
} from '@harness/contracts';
import { openDatabase } from '../storage/database';
import { Repository } from '../storage/repository';
import { chatService } from './service';
import { visionOutbound } from './vision';
function hashed(bytes: Buffer) {
  return {
    id: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    data: bytes.toString('base64'),
  };
}
function sse() {
  return new Response(
    [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'item' },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'item',
        output_index: 0,
        delta: 'seen',
      },
      { type: 'response.completed', response: {} },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
function textBody(body: BodyInit | null | undefined) {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer)
    return new TextDecoder().decode(new Uint8Array(body));
  return '';
}
it('sends temporary image bytes only when vision is supported', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'harness-vision-'));
  const db = openDatabase(join(directory, 'data.sqlite'));
  const image = hashed(Buffer.from('fixture-image-bytes'));
  const bodies: string[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const target =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!target.startsWith('http://') && !target.startsWith('https://'))
      return Promise.reject(new Error('Unexpected provider request.'));
    bodies.push(textBody(init?.body));
    return Promise.resolve(sse());
  });
  try {
    const repository = new Repository(db, directory);
    repository.dispatch({
      action: 'attachment.write',
      id: image.id,
      name: 'picture.png',
      mediaType: 'image/png',
      size: image.bytes.length,
      offset: 0,
      data: image.data,
    });
    expect(readFileSync(join(directory, 'attachments', image.id))).toEqual(
      image.bytes,
    );
    const input: GenerationInput = {
      generationId: 'g',
      conversationId: 'c',
      connectionId: 'chatgpt',
      modelId: 'fixture',
      messages: [
        {
          id: 'u',
          role: 'user',
          text: 'See this',
          attachmentIds: [image.id],
        },
      ],
    };
    repository.begin(input);
    const service = chatService(directory, fetcher);
    const supported = visionOutbound(repository, input, {
      images: 'supported',
    });
    expect(supported.vision).toBe(true);
    expect(supported.outbound.messages[0]?.attachmentIds).toEqual([image.id]);
    expect(supported.images['u']?.[0]).toEqual({
      mediaType: 'image/png',
      data: image.data,
    });
    const seen: string[] = [];
    for await (const text of service.stream(
      supported.outbound,
      { credential: 'fixture-token' },
      new AbortController(),
      '',
      supported.images,
      supported.vision,
    ))
      seen.push(text);
    expect(seen).toEqual(['seen']);
    const sent = JSON.parse(bodies[0] ?? '{}') as {
      input: { content: unknown }[];
    };
    expect(sent.input[0]?.content).toEqual([
      { type: 'input_text', text: 'See this' },
      {
        type: 'input_image',
        image_url: `data:image/png;base64,${image.data}`,
      },
    ]);
    bodies.length = 0;
    const openAi = visionOutbound(repository, input, { vision: 'supported' });
    for await (const text of service.stream(
      { ...openAi.outbound, connectionId: 'openai' },
      { credential: 'fixture-token' },
      new AbortController(),
      '',
      openAi.images,
      openAi.vision,
    ))
      expect(text).toContain('seen');
    expect(bodies[0]).toContain(image.data);
    const withheld = visionOutbound(repository, input);
    const unsupported = visionOutbound(repository, input, {
      images: 'unsupported',
    });
    const unknown = visionOutbound(repository, input, { images: 'unknown' });
    for (const prepared of [withheld, unsupported, unknown]) {
      expect(prepared.vision).toBe(false);
      expect(prepared.images).toEqual({});
      expect(prepared.outbound.messages[0]?.attachmentIds).toBeUndefined();
    }
    expect(generationControlFlags().vision).toBe(false);
    bodies.length = 0;
    for await (const text of service.stream(
      supported.outbound,
      { credential: 'fixture-token' },
      new AbortController(),
      '',
      supported.images,
      false,
    ))
      expect(text).toBe('seen');
    expect(bodies[0]).not.toContain(image.data);
    const stored = repository.get('c')?.messages[0];
    expect(stored?.text).toBe('See this');
    expect(stored?.attachmentIds).toEqual([image.id]);
    expect(stored?.text).not.toContain(image.data);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
