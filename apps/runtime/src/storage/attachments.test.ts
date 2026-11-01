import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { GenerationInput } from '@harness/contracts';
import { openDatabase } from './database';
import { Repository } from './repository';
function hashed(text: string) {
  const bytes = Buffer.from(text);
  return {
    id: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    data: bytes.toString('base64'),
  };
}
it('stores content-addressed files and withholds images without vision', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harness-attachments-'));
  const db = openDatabase(join(directory, 'data.sqlite'));
  try {
    const repository = new Repository(db, directory);
    const note = hashed('hello attachment');
    const image = hashed('not-a-real-image');
    expect(
      repository.dispatch({
        action: 'attachment.write',
        id: note.id,
        name: 'notes.md',
        mediaType: 'text/markdown',
        size: note.bytes.length,
        offset: 0,
        data: note.data,
      }),
    ).toMatchObject({ id: note.id });
    repository.dispatch({
      action: 'attachment.write',
      id: image.id,
      name: 'picture.png',
      mediaType: 'image/png',
      size: image.bytes.length,
      offset: 0,
      data: image.data,
    });
    expect(() =>
      repository.dispatch({
        action: 'attachment.write',
        id: 'b'.repeat(64),
        name: 'picture.png',
        mediaType: 'image/png',
        size: image.bytes.length,
        offset: 0,
        data: image.data,
      }),
    ).toThrow(/do not match/);
    const input: GenerationInput = {
      generationId: 'g',
      conversationId: 'c',
      connectionId: 'openai',
      modelId: 'fixture',
      messages: [
        {
          id: 'u',
          role: 'user',
          text: 'See files',
          attachmentIds: [note.id, image.id],
        },
      ],
    };
    repository.begin(input);
    const stored = repository.get('c')?.messages[0];
    expect(stored?.text).toBe('See files');
    expect(stored?.attachmentIds).toEqual([note.id, image.id]);
    const hidden = repository.providerMessages(input, false);
    expect(hidden.messages[0]?.attachmentIds).toEqual([note.id]);
    expect(hidden.messages[0]?.text).toContain('hello attachment');
    expect(hidden.messages[0]?.text).not.toContain(image.data);
    const visible = repository.providerMessages(input, true);
    expect(visible.messages[0]?.attachmentIds).toEqual([note.id, image.id]);
    expect(visible.messages[0]?.text).not.toContain(image.data);
    expect(
      repository.dispatch({
        action: 'attachment.read',
        id: note.id,
        offset: 0,
        length: 196_608,
      }),
    ).toMatchObject({ data: note.data, complete: true });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
