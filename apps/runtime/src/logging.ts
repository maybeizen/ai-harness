export function log(event: string) {
  process.stderr.write(
    JSON.stringify({ level: 'info', event, time: new Date().toISOString() }) +
      '\n',
  );
}
