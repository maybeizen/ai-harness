import { MAX_MESSAGE_BYTES } from '@harness/contracts';
export class LineDecoder {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer): string[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const lines: string[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf(10)) >= 0) {
      if (newline > MAX_MESSAGE_BYTES)
        throw new Error('Message exceeds maximum size');
      lines.push(this.buffer.subarray(0, newline).toString('utf8'));
      this.buffer = this.buffer.subarray(newline + 1);
    }
    if (this.buffer.length > MAX_MESSAGE_BYTES)
      throw new Error('Message exceeds maximum size');
    return lines;
  }
}
