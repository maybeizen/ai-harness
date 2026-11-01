import type { Writable } from 'node:stream';
import { MAX_MESSAGE_BYTES } from '@harness/contracts';
export function jsonWriter(output: Writable) {
  let previous = Promise.resolve();
  return (value: unknown): Promise<void> => {
    const line = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES + 1)
      return Promise.reject(new Error('Frame too large'));
    previous = previous.then(
      () =>
        new Promise<void>((resolve, reject) => {
          output.write(line, (error) => (error ? reject(error) : resolve()));
        }),
    );
    return previous;
  };
}
