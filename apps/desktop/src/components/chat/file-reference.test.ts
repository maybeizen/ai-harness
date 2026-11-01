import { expect, it } from 'vitest';
import { fileReference } from './file-reference';
it('reads a file path from a tool call and ignores prose', () => {
  expect(
    fileReference({
      callId: '1',
      name: 'read_file',
      status: 'completed',
      input: '{"path":"src/main.ts"}',
    }),
  ).toBe('src/main.ts');
  expect(
    fileReference({
      callId: '2',
      name: 'search',
      status: 'completed',
      input: 'look for the bug',
    }),
  ).toBe('');
});
