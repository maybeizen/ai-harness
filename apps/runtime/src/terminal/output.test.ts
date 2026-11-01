import { it, expect } from 'vitest';
import { TerminalOutput } from './output';
import { terminalOperationSchema } from '@harness/contracts';
it('bounds the output ring and preserves UTF8 boundaries across truncation and polls', () => {
  const output = new TerminalOutput(17);
  output.append('🌈'.repeat(1000));
  let cursor = 0;
  let collected = '';
  for (let i = 0; i < 4; i++) {
    const part = output.poll(cursor, 7);
    expect(part.data).toBe('🌈');
    expect(part.truncated).toBe(i === 0);
    cursor = part.cursor;
    collected += part.data;
  }
  expect(collected).toBe('🌈'.repeat(4));
  expect(output.poll(cursor, 7).data).toBe('');
  expect(() => output.poll(cursor + 1, 7)).toThrow('cursor');
});
it('rejects unbounded or malformed terminal input at the wire boundary', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  for (const operation of [
    { action: 'write', id, data: 'x'.repeat(16385) },
    { action: 'resize', id, cols: 0, rows: 24 },
    { action: 'poll', id, cursor: -1 },
    { action: 'create', workspaceId: id, command: 'whoami' },
    { action: 'create', workspaceId: '../escape' },
  ])
    expect(terminalOperationSchema.safeParse(operation).success).toBe(false);
  expect(
    terminalOperationSchema.parse({ action: 'create', workspaceId: id }),
  ).toMatchObject({ cols: 100, rows: 30 });
});
