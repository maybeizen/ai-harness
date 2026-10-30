import { it, expect } from 'vitest';
import { spawn } from 'node-pty';
import { mcpClientType } from './mcp';
it('loads MCP without connecting', () => {
  expect(mcpClientType).toBeTypeOf('function');
});
it('starts a temporary PTY and observes its exit', async () => {
  const terminal = spawn('/bin/sh', ['-c', 'printf harness-pty-ok'], {
    name: 'xterm',
    cols: 80,
    rows: 24,
    env: { PATH: '/usr/bin:/bin' },
  });
  let output = '';
  const data = terminal.onData((value) => {
    output += value;
  });
  try {
    const exit = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        terminal.kill();
        reject(new Error('PTY timed out'));
      }, 5000);
      terminal.onExit((event) => {
        clearTimeout(timer);
        resolve(event.exitCode);
      });
    });
    expect(exit).toBe(0);
    expect(output).toContain('harness-pty-ok');
    expect(() => process.kill(terminal.pid, 0)).toThrow();
  } finally {
    data.dispose();
    terminal.kill();
  }
});
