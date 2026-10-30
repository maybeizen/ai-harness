import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory } from './config';
import { log } from './logging';
import { openDatabase } from './storage/database';
import { Repository } from './storage/repository';
import { LineDecoder } from './transport/framing';
import { RuntimeServer } from './transport/server';
import { jsonWriter } from './transport/writer';
import { chatService } from './chat/service';
const directory = dataDirectory();
mkdirSync(directory, { recursive: true, mode: 0o700 });
const database = openDatabase(join(directory, 'harness.sqlite'));
const server = new RuntimeServer(
  chatService(directory),
  jsonWriter(process.stdout),
  new Repository(database),
);
const decoder = new LineDecoder();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  process.stdin.destroy();
  const deadline = setTimeout(() => process.exit(1), 5000);
  deadline.unref();
  await server.close();
  database.close();
  log('runtime.stopped');
  clearTimeout(deadline);
}
process.on('SIGTERM', () => {
  void close();
});
process.on('SIGINT', () => {
  void close();
});
process.stdin.on('end', () => {
  void close();
});
process.stdin.on('data', (chunk: Buffer) => {
  try {
    for (const line of decoder.push(chunk)) {
      if (closing) break;
      void server
        .handle(line)
        .then((shutdown) => {
          if (shutdown) void close();
        })
        .catch(() => {
          log('protocol.fatal');
          process.exitCode = 1;
          void close();
        });
    }
  } catch {
    log('protocol.fatal');
    process.exitCode = 1;
    void close();
  }
});
log('runtime.started');
