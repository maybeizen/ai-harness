import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentPollSchema,
  agentRequestSchema,
  directorySchema,
  type AgentEvent,
  type AgentMode,
} from '@harness/contracts';
import type { ProviderTurnEvent } from '@harness/providers';
import { openDatabase } from '../storage/database';
import { Workspaces } from '../workspaces/service';
import { Workstation } from '../workstation/service';
import { AgentService } from '../agent/service';
import { Mcps } from './service';
const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  inputTokenDetails: {
    noCacheTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
};
const finish = (): ProviderTurnEvent => ({
  type: 'finish',
  reason: 'stop',
  usage,
  messages: [],
});
async function httpFixture() {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (request.method === 'DELETE') {
      response.writeHead(200).end();
      return;
    }
    let body = '';
    request.on('data', (part: Buffer) => (body += part.toString()));
    request.on('end', () => {
      const message = JSON.parse(body) as {
        id?: number;
        method: string;
        params?: { arguments?: { text?: string } };
      };
      calls.push(message.method);
      if (!('id' in message)) {
        response.writeHead(202).end();
        return;
      }
      const result =
        message.method === 'initialize'
          ? {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'fixture', version: '1' },
            }
          : message.method === 'tools/list'
            ? {
                tools: [
                  {
                    name: 'echo',
                    description: 'Fixture echo',
                    inputSchema: {
                      type: 'object',
                      properties: { text: { type: 'string' } },
                      required: ['text'],
                      additionalProperties: false,
                    },
                  },
                ],
              }
            : {
                content: [
                  { type: 'text', text: message.params?.arguments?.text ?? '' },
                ],
              };
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture');
  return {
    calls,
    url: `http://127.0.0.1:${address.port}/mcp`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
it('registers MCP tools as approved external effects and hides them from read-only modes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mcp-agent-'));
  const db = openDatabase(join(root, 'harness.sqlite'));
  const http = await httpFixture();
  const mcps = new Mcps(db);
  const workspaces = new Workspaces(db);
  const workstation = new Workstation(db, root, '0.1.0', mcps);
  const seen = new Map<AgentMode, string[]>();
  const workspace = directorySchema.parse(
    await workspaces.dispatch({ action: 'register', path: root }),
  );
  const id = randomUUID();
  try {
    const saved = await workstation.dispatch({
      action: 'mcp.save',
      config: {
        id,
        name: 'Fixture',
        enabled: true,
        transport: 'http',
        url: http.url,
        credentialRef: null,
        timeoutMs: 1000,
      },
    });
    expect(JSON.stringify(saved)).not.toContain('bearer');
    const connected = await workstation.dispatch({
      action: 'mcp.connect',
      id,
      approved: true,
    });
    expect(connected).toMatchObject({
      registered: true,
      servers: [{ name: 'Fixture', status: 'connected', enabledToolCount: 1 }],
    });
    expect(JSON.stringify(connected)).not.toContain(http.url);
    const discovered = await workstation.dispatch({
      action: 'mcp.discover',
      id,
    });
    expect(discovered).toMatchObject({
      tools: [{ name: 'echo', enabled: true }],
    });
    expect(JSON.stringify(discovered)).not.toContain('private-token');
    const tool = mcps.definitions({ mode: 'agent' })[0]!;
    expect(tool.effect).toBe('external');
    for (const mode of ['ask', 'plan', 'review', 'security', 'edit'] as const) {
      const names: string[] = [];
      const runner = new AgentService(
        db,
        workspaces,
        async function* (input) {
          await Promise.resolve();
          names.push(...input.tools.map((item) => item.name));
          yield finish();
        },
        undefined,
        mcps,
      );
      const request = agentRequestSchema.parse({
        id: randomUUID(),
        workspaceId: workspace.id,
        mode,
        policy: 'full',
        prompt: 'Inspect the workspace.',
      });
      await runner.dispatch({ action: 'reserve', request });
      await runner.dispatch({
        action: 'start',
        id: request.id,
        connectionId: 'openai',
        modelId: 'fixture',
        credential: 'private-token',
      });
      await vi.waitFor(async () => {
        const status = agentPollSchema.parse(
          await runner.dispatch({ action: 'poll', id: request.id, after: 0 }),
        ).status;
        expect(['completed', 'error']).toContain(status);
      });
      seen.set(mode, names);
      await runner.close();
    }
    for (const mode of ['ask', 'plan', 'review', 'security'] as const)
      expect(seen.get(mode)?.some((name) => name.startsWith('mcp_'))).toBe(
        false,
      );
    expect(seen.get('edit')).toContain(tool.name);
    expect(seen.get('review')).toContain('report_findings');
    const callsBefore = http.calls.filter(
      (method) => method === 'tools/call',
    ).length;
    const request = agentRequestSchema.parse({
      id: randomUUID(),
      workspaceId: workspace.id,
      mode: 'agent',
      policy: 'full',
      prompt: 'Use the external tool.',
    });
    let step = 0;
    let baseURL = '';
    const runner = new AgentService(
      db,
      workspaces,
      async function* (turn) {
        await Promise.resolve();
        baseURL = turn.baseURL ?? '';
        if (step++ === 0) {
          yield {
            type: 'call',
            id: 'external',
            name: tool.name,
            input: { text: 'hello' },
          };
          yield { type: 'finish', reason: 'tool-calls', usage, messages: [] };
        } else yield finish();
      },
      undefined,
      mcps,
    );
    await runner.dispatch({ action: 'reserve', request });
    await runner.dispatch({
      action: 'start',
      id: request.id,
      connectionId: 'custom',
      modelId: 'fixture',
      credential: 'private-token',
      baseURL: 'http://127.0.0.1:9/v1',
    });
    let approval: Extract<AgentEvent, { type: 'approval' }> | undefined;
    await vi.waitFor(async () => {
      approval = agentPollSchema
        .parse(
          await runner.dispatch({ action: 'poll', id: request.id, after: 0 }),
        )
        .events.map((item) => item.event)
        .find(
          (item): item is Extract<AgentEvent, { type: 'approval' }> =>
            item.type === 'approval',
        );
      expect(approval?.approval.tool).toBe(tool.name);
    });
    expect(http.calls.filter((method) => method === 'tools/call')).toHaveLength(
      callsBefore,
    );
    expect(baseURL).toBe('http://127.0.0.1:9/v1');
    expect(approval?.approval.summary).toContain('External MCP');
    expect(JSON.stringify(approval)).not.toContain('private-token');
    await runner.dispatch({
      action: 'approve',
      decision: {
        id: approval!.approval.id,
        requestHash: approval!.approval.requestHash,
        decision: 'allow',
      },
    });
    await vi.waitFor(async () =>
      expect(
        agentPollSchema.parse(
          await runner.dispatch({ action: 'poll', id: request.id, after: 0 }),
        ).status,
      ).toBe('completed'),
    );
    expect(
      http.calls.filter((method) => method === 'tools/call').length,
    ).toBeGreaterThan(callsBefore);
    await mcps.dispatch({
      action: 'save',
      config: {
        id,
        name: 'Fixture',
        enabled: true,
        transport: 'http',
        url: `${http.url}/changed`,
        credentialRef: null,
        timeoutMs: 1000,
      },
    });
    expect(
      mcps.definitions({ mode: 'agent' }).map((item) => item.name),
    ).not.toContain(tool.name);
    await runner.close();
  } finally {
    await mcps.close();
    await workspaces.close();
    db.close();
    await http.close();
    await rm(root, { recursive: true, force: true });
  }
});
