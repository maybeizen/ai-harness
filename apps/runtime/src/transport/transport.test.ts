import { describe, it, expect } from 'vitest';
import { LineDecoder } from './framing';
import { handleLine } from './handler';
describe('runtime protocol', () => {
  it('reassembles split Unicode messages and multiple frames', () => {
    const decoder = new LineDecoder();
    const bytes = Buffer.from('héllo\nworld\n');
    expect(decoder.push(bytes.subarray(0, 2))).toEqual([]);
    expect(decoder.push(bytes.subarray(2))).toEqual(['héllo', 'world']);
  });
  it('bounds incomplete and complete messages', () => {
    expect(() => new LineDecoder().push(Buffer.alloc(1048577))).toThrow();
    expect(() =>
      new LineDecoder().push(Buffer.from('x'.repeat(1048577) + '\n')),
    ).toThrow();
  });
  it('rejects malformed input and version mismatch without shutdown', () => {
    expect(handleLine('{').response).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(
      handleLine('{"version":99,"id":"x","method":"hello"}'),
    ).toMatchObject({
      shutdown: false,
      response: { id: 'x', ok: false, error: { code: 'VERSION_MISMATCH' } },
    });
  });
  it('correlates valid responses and acknowledges shutdown', () => {
    expect(
      handleLine('{"version":2,"id":"stop-1","method":"shutdown"}'),
    ).toMatchObject({ shutdown: true, response: { id: 'stop-1', ok: true } });
  });
});
