import { resolve } from 'node:path';
export function dataDirectory(env: NodeJS.ProcessEnv = process.env) {
  const directory = env['HARNESS_DATA_DIR'];
  if (!directory)
    throw new Error('HARNESS_DATA_DIR must be supplied by the host');
  return resolve(directory);
}
