import { it, expect } from 'vitest';
import { claudeOptions } from './claude';
it('isolates the official client from tools, persistence, project settings and billing overrides', () => {
  const options = claudeOptions(
    '/fixture/claude',
    '/fixture/app-owned',
    new AbortController(),
  );
  expect(options).toMatchObject({
    tools: [],
    disallowedTools: ['*'],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    persistSession: false,
    plugins: [],
    hooks: {},
    skills: [],
    agents: {},
    maxTurns: 1,
    extraArgs: { 'safe-mode': null },
  });
  expect(options.env).not.toHaveProperty('ANTHROPIC_API_KEY');
  expect(options.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
  expect(options.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
});
