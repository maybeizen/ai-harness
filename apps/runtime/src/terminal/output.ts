export class TerminalOutput {
  private data = Buffer.alloc(0);
  private offset = 0;
  constructor(private maximum = 262144) {}
  append(value: string) {
    const next = Buffer.from(value, 'utf8');
    this.data = Buffer.concat([this.data, next]);
    if (this.data.length <= this.maximum) return;
    let dropped = this.data.length - this.maximum;
    while (dropped < this.data.length && (this.data[dropped]! & 0xc0) === 0x80)
      dropped++;
    this.data = this.data.subarray(dropped);
    this.offset += dropped;
  }
  poll(cursor: number, limit: number) {
    const end = this.offset + this.data.length;
    if (cursor > end) throw new Error('The terminal output cursor is invalid.');
    const truncated = cursor < this.offset;
    let start = Math.max(cursor, this.offset) - this.offset;
    while (start < this.data.length && (this.data[start]! & 0xc0) === 0x80)
      start++;
    let stop = Math.min(start + limit, this.data.length);
    while (
      stop > start &&
      stop < this.data.length &&
      (this.data[stop]! & 0xc0) === 0x80
    )
      stop--;
    return {
      data: this.data.subarray(start, stop).toString('utf8'),
      cursor: this.offset + stop,
      truncated,
    };
  }
}
