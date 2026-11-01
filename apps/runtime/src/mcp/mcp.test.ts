import { it, expect } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinuxExecutor } from '../agent/isolated-executor';
import { openDatabase } from '../storage/database';
import { Mcps } from './service';
import {
  mcpServerSummarySchema,
  mcpToolSummarySchema,
  type McpServerConfig,
} from '@harness/contracts';
async function revision(service: Mcps, id: string) {
  const list = (await service.dispatch({ action: 'list' })) as unknown[];
  const summary = list
    .map((value) => mcpServerSummarySchema.parse(value))
    .find((value) => value.config.id === id);
  if (!summary) throw new Error('Missing fixture server');
  return summary.revision;
}
async function fixture() {
  const requests: Array<{
    method: string;
    authorization: string | undefined;
    params?: Record<string, unknown>;
  }> = [];
  let tools: unknown[] = [
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
  ];
  const pending = new Set<ServerResponse>();
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
        params?: Record<string, unknown>;
      };
      requests.push({
        method: message.method,
        authorization: request.headers.authorization,
        ...(message.params ? { params: message.params } : {}),
      });
      if (!('id' in message)) {
        response.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (message.method === 'initialize')
        result = {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'fixture', version: '1' },
        };
      else if (message.method === 'tools/list') result = { tools };
      else if (message.method === 'tools/call') {
        const input = message.params?.['arguments'] as { text: string };
        if (input.text === 'wait') {
          pending.add(response);
          return;
        }
        result = {
          content: [
            {
              type: 'text',
              text: input.text === 'large' ? 'x'.repeat(140000) : input.text,
            },
          ],
          ...(input.text === 'failure' ? { isError: true } : {}),
        };
      } else {
        response.writeHead(400).end();
        return;
      }
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address');
  const db = openDatabase(':memory:');
  const service = new Mcps(db);
  const config: McpServerConfig = {
    id: randomUUID(),
    name: 'Fixture',
    enabled: true,
    transport: 'http',
    url: `http://127.0.0.1:${address.port}/mcp`,
    credentialRef: null,
    timeoutMs: 1000,
  };
  await service.dispatch({ action: 'save', config });
  return {
    db,
    service,
    config,
    requests,
    setTools(value: unknown[]) {
      tools = value;
    },
    async close() {
      await service.close();
      for (const item of pending) item.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
it('connects/discovers/calls a real StreamableHTTP server with validated schemas and no public execute RPC', async () => {
  const f = await fixture();
  try {
    const summary = mcpServerSummarySchema.parse(
      await f.service.dispatch({ action: 'connect', id: f.config.id }),
    );
    expect(summary.status).toBe('connected');
    expect(summary.enabledToolCount).toBe(1);
    const definition = f.service.definitions({ mode: 'agent' })[0]!;
    expect(definition.effect).toBe('external');
    expect(f.service.definitions({ mode: 'ask' })).toEqual([]);
    expect(f.service.definitions({ mode: 'plan' })).toEqual([]);
    expect(
      await f.service.execute(
        definition.name,
        { text: 'hello' },
        new AbortController().signal,
      ),
    ).toMatchObject({ content: [{ type: 'text', text: 'hello' }] });
    const calls = f.requests.filter(
      (item) => item.method === 'tools/call',
    ).length;
    await expect(
      f.service.execute(
        definition.name,
        { text: 42 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'INVALID_TOOL_CALL' } });
    expect(
      f.requests.filter((item) => item.method === 'tools/call'),
    ).toHaveLength(calls);
  } finally {
    await f.close();
  }
});
it('disables unknown schemas and invalidates model tool names after refresh, config changes and disconnect', async () => {
  const f = await fixture();
  try {
    await f.service.dispatch({ action: 'connect', id: f.config.id });
    const original = f.service.definitions({ mode: 'agent' })[0]!.name;
    await f.service.dispatch({ action: 'discover', id: f.config.id });
    expect(f.service.definitions({ mode: 'agent' })[0]!.name).not.toBe(
      original,
    );
    await expect(
      f.service.execute(original, { text: 'no' }, new AbortController().signal),
    ).rejects.toMatchObject({ detail: { code: 'MCP_STALE_TOOL' } });
    f.setTools([
      {
        name: 'unsafe',
        inputSchema: {
          type: 'object',
          properties: { x: { $ref: 'https://malicious.invalid' } },
        },
      },
    ]);
    const tools = (
      (await f.service.dispatch({
        action: 'discover',
        id: f.config.id,
      })) as unknown[]
    ).map((item) => mcpToolSummarySchema.parse(item));
    expect(tools[0]?.enabled).toBe(false);
    expect(f.service.definitions({ mode: 'agent' })).toEqual([]);
    await f.service.dispatch({
      action: 'save',
      config: { ...f.config, enabled: false },
    });
    expect(f.service.definitions({ mode: 'agent' })).toEqual([]);
  } finally {
    await f.close();
  }
});
it('keeps bearer values transient and redacts echoes from server content', async () => {
  const f = await fixture();
  try {
    const bearer = 'fixture-private-token';
    await f.service.dispatch({
      action: 'save',
      config: { ...f.config, credentialRef: f.config.id },
    });
    await expect(
      f.service.dispatch({ action: 'connect', id: f.config.id }),
    ).rejects.toMatchObject({ detail: { code: 'MCP_AUTH_REQUIRED' } });
    await f.service.dispatch({
      action: 'connect-auth',
      id: f.config.id,
      bearer,
      expectedRevision: await revision(f.service, f.config.id),
    });
    const tool = f.service.definitions({ mode: 'agent' })[0]!;
    const output = await f.service.execute(
      tool.name,
      { text: bearer },
      new AbortController().signal,
    );
    expect(JSON.stringify(output)).not.toContain(bearer);
    expect(
      f.requests.find((item) => item.method === 'initialize')?.authorization,
    ).toBe(`Bearer ${bearer}`);
    expect(
      JSON.stringify(f.db.prepare('SELECT config FROM mcp_servers').all()),
    ).not.toContain(bearer);
    expect(
      JSON.stringify(await f.service.dispatch({ action: 'list' })),
    ).not.toContain(bearer);
  } finally {
    await f.close();
  }
});
it('cancels pending remote calls, preserves explicit tool errors and closes sessions', async () => {
  const f = await fixture();
  try {
    await f.service.dispatch({ action: 'connect', id: f.config.id });
    const tool = f.service.definitions({ mode: 'agent' })[0]!;
    await expect(
      f.service.execute(
        tool.name,
        { text: 'failure' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'MCP_TOOL_ERROR' } });
    const controller = new AbortController();
    const pending = f.service.execute(
      tool.name,
      { text: 'wait' },
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      detail: { code: 'CANCELLED' },
    });
    controller.abort();
    await rejected;
    await f.service.dispatch({ action: 'disconnect', id: f.config.id });
    expect(f.service.definitions({ mode: 'agent' })).toEqual([]);
  } finally {
    await f.close();
  }
});
it('fails closed for local processes without host spawn or isolation', async () => {
  const f = await fixture();
  const directory = await mkdtemp(join(tmpdir(), 'mcp-stdio-'));
  const sentinel = join(directory, 'ran');
  const script = join(directory, 'run.mjs');
  const workspaceId = randomUUID();
  let opened = false;
  try {
    await writeFile(
      script,
      `import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], 'ran');\n`,
    );
    f.db
      .prepare(
        'INSERT INTO workspace_directories(id, name, path) VALUES (?, ?, ?)',
      )
      .run(workspaceId, 'fixture', directory);
    const config: McpServerConfig = {
      id: randomUUID(),
      name: 'Local fixture',
      enabled: true,
      transport: 'stdio',
      command: process.execPath,
      args: [script, sentinel],
      workspaceId,
      credentialRef: null,
      timeoutMs: 1000,
    };
    await f.service.dispatch({ action: 'save', config });
    await expect(
      f.service.dispatch({ action: 'connect', id: config.id }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    const guarded = new Mcps(f.db, {
      isolated: true as const,
      execute: () => Promise.reject(new Error('host execute')),
      openStdio: () => {
        opened = true;
        return Promise.reject(new Error('host stdio'));
      },
    });
    await expect(
      guarded.dispatch({ action: 'connect', id: config.id }),
    ).rejects.toMatchObject({ detail: { code: 'PERMISSION_DENIED' } });
    expect(opened).toBe(false);
    const blocked = new Mcps(f.db, {
      isolated: true as const,
      execute: () => Promise.reject(new Error('host execute')),
    });
    await expect(
      blocked.dispatch({
        action: 'connect',
        id: config.id,
        approved: true,
      }),
    ).rejects.toMatchObject({ detail: { code: 'ISOLATION_UNAVAILABLE' } });
    await blocked.close();
    const isolated = new Mcps(f.db, new LinuxExecutor('/missing/bwrap'));
    await expect(
      isolated.dispatch({
        action: 'connect',
        id: config.id,
        approved: true,
      }),
    ).rejects.toMatchObject({ detail: { code: 'ISOLATION_UNAVAILABLE' } });
    await expect(readFile(sentinel, 'utf8')).rejects.toThrow();
    await guarded.close();
    await isolated.close();
  } finally {
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('rejects redirects without forwarding bearer credentials to another endpoint', async () => {
  let leaked = false;
  const target = createServer((_request, response) => {
    leaked = true;
    response.writeHead(200).end();
  });
  target.listen(0, '127.0.0.1');
  await once(target, 'listening');
  const destination = target.address();
  if (!destination || typeof destination === 'string')
    throw new Error('Missing redirecttarget');
  const redirect = createServer((_request, response) => {
    response
      .writeHead(307, {
        Location: `http://127.0.0.1:${destination.port}/steal`,
      })
      .end();
  });
  redirect.listen(0, '127.0.0.1');
  await once(redirect, 'listening');
  const address = redirect.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing redirectsource');
  const db = openDatabase(':memory:');
  const service = new Mcps(db);
  const id = randomUUID();
  try {
    await service.dispatch({
      action: 'save',
      config: {
        id,
        name: 'Redirect',
        transport: 'http',
        url: `http://127.0.0.1:${address.port}/mcp`,
        enabled: true,
        credentialRef: id,
        timeoutMs: 1000,
      },
    });
    await expect(
      service.dispatch({
        action: 'connect-auth',
        id,
        bearer: 'private-fixture',
        expectedRevision: await revision(service, id),
      }),
    ).rejects.toMatchObject({ detail: { code: 'MCP_CONNECTION' } });
    expect(leaked).toBe(false);
  } finally {
    await service.close();
    db.close();
    redirect.closeAllConnections();
    target.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => redirect.close(() => resolve())),
      new Promise<void>((resolve) => target.close(() => resolve())),
    ]);
  }
});
it('bounds tool output and times out unresponsive tools without automatic retries', async () => {
  const f = await fixture();
  try {
    await f.service.dispatch({ action: 'connect', id: f.config.id });
    const tool = f.service.definitions({ mode: 'agent' })[0]!;
    await expect(
      f.service.execute(
        tool.name,
        { text: 'x'.repeat(140000) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'MCP_INPUT_LIMIT' } });
    await expect(
      f.service.execute(
        tool.name,
        { text: 'large' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'MCP_OUTPUT_LIMIT' } });
    await expect(
      f.service.execute(
        tool.name,
        { text: 'wait' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'MCP_TOOL_ERROR' } });
    expect(
      f.requests.filter((item) => item.method === 'tools/call'),
    ).toHaveLength(2);
  } finally {
    await f.close();
  }
});
it('a close racing connect prevents network work and rejects later lifecycle actions', async () => {
  const f = await fixture();
  try {
    const pending = f.service.dispatch({ action: 'connect', id: f.config.id });
    const rejected = expect(pending).rejects.toBeDefined();
    await f.service.close();
    await rejected;
    expect(
      f.requests.filter((item) => item.method === 'initialize'),
    ).toHaveLength(0);
    await expect(f.service.dispatch({ action: 'list' })).rejects.toMatchObject({
      detail: { code: 'UNAVAILABLE' },
    });
  } finally {
    await f.close();
  }
});
it('rejects a changed reviewed configuration before forwarding any credential or HTTP request', async () => {
  const f = await fixture();
  try {
    const reviewed = await revision(f.service, f.config.id);
    await f.service.dispatch({
      action: 'save',
      config: {
        ...f.config,
        url: f.config.url + '/changed',
        credentialRef: randomUUID(),
      },
    });
    await expect(
      f.service.dispatch({
        action: 'connect-auth',
        id: f.config.id,
        bearer: 'never-forward-this',
        expectedRevision: reviewed,
      }),
    ).rejects.toMatchObject({ detail: { code: 'MCP_CONFIG_CHANGED' } });
    expect(f.requests).toHaveLength(0);
  } finally {
    await f.close();
  }
});
