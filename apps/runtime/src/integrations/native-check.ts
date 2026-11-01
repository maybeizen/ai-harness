import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'node-pty';
import { openDatabase } from '../storage/database';
import { mcpClientType } from './mcp';
import { createModel } from '@harness/providers';
const db = openDatabase(':memory:');
db.close();
if (typeof query !== 'function')
  throw new Error('Official client SDK unavailable');
if (typeof mcpClientType !== 'function')
  throw new Error('MCP dependency unavailable');
void createModel(
  { id: 'offline', kind: 'ollama' },
  {
    providerId: 'offline',
    modelId: 'fixture',
    capabilities: {
      tools: 'unknown',
      images: 'unknown',
      structuredOutput: 'unknown',
    },
  },
  { credentials: { resolve: () => Promise.resolve(undefined) } },
).then(() => {
  const terminal = spawn('/bin/sh', ['-c', 'printf native-ok'], {
    name: 'xterm',
    cols: 80,
    rows: 24,
    env: { PATH: '/usr/bin:/bin' },
  });
  let output = '';
  terminal.onData((data) => {
    output += data;
  });
  const timer = setTimeout(() => {
    terminal.kill();
    process.exitCode = 1;
  }, 5000);
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timer);
    if (exitCode !== 0 || !output.includes('native-ok')) process.exitCode = 1;
    else process.stdout.write('HARNESS_NATIVE_READY\n');
  });
});
