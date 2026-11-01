import { it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import {
  directorySchema,
  terminalOperationSchema,
  terminalSummarySchema,
  terminalPollSchema,
  type TerminalSummary,
} from '@harness/contracts';
import { openDatabase } from '../storage/database';
import { Workspaces } from '../workspaces/service';
import { TerminalService } from './service';
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'axioden-terminal-'));
  const db = openDatabase(':memory:');
  const workspaces = new Workspaces(db);
  const registered = directorySchema.parse(
    await workspaces.dispatch({ action: 'register', path: directory }),
  );
  const terminal = new TerminalService(workspaces);
  const send = (operation: unknown) =>
    terminal.dispatch(terminalOperationSchema.parse(operation));
  const create = async () =>
    terminalSummarySchema.parse(
      await send({ action: 'create', workspaceId: registered.id }),
    );
  const poll = async (id: string) =>
    terminalPollSchema.parse(
      await send({ action: 'poll', id, cursor: 0, limit: 65536 }),
    );
  return {
    directory,
    db,
    workspaces,
    registered,
    terminal,
    send,
    create,
    poll,
    close: async () => {
      await terminal.close();
      await workspaces.close();
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function processTree(pid: number) {
  const parents = new Map<number, number>();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parents.set(Number(name), Number(fields[1]));
    } catch {
      /* Processes can exit while reading /proc. */
    }
  }
  const found = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, parent] of parents)
      if (found.has(parent) && !found.has(child)) {
        found.add(child);
        changed = true;
      }
  }
  return [...found];
}
it('runs a real interactive PTY in the selected directory, sanitizes inherited secrets and resizes', async () => {
  const f = await fixture();
  process.env['AXIODEN_TERMINAL_TEST_TOKEN'] = 'not-in-terminal-env';
  try {
    const tab = await f.create();
    await f.send({
      action: 'write',
      id: tab.id,
      data: "printf '\\nREADY_TERM\\n'; pwd; printf '%s\\n' \"${AXIODEN_TERMINAL_TEST_TOKEN-unset}\"\r",
    });
    await vi.waitFor(
      async () => {
        const output = await f.poll(tab.id);
        expect(output.data).toMatch(/\r?\nREADY_TERM\r?\n/);
        expect(output.data).toContain(f.directory);
        expect(output.data).toMatch(/\r?\nunset\r?\n/);
        expect(output.data).not.toContain('not-in-terminal-env');
      },
      { timeout: 5000, interval: 20 },
    );
    await f.send({ action: 'resize', id: tab.id, cols: 121, rows: 42 });
    await f.send({ action: 'write', id: tab.id, data: 'stty size\r' });
    await vi.waitFor(
      async () =>
        expect(
          stripVTControlCharacters((await f.poll(tab.id)).data).replace(
            /\r/g,
            '',
          ),
        ).toMatch(/\n42 121\n/),
      { timeout: 3000, interval: 20 },
    );
    await f.send({ action: 'write', id: tab.id, data: 'exit\r' });
    await vi.waitFor(
      async () => expect((await f.poll(tab.id)).status).toBe('exited'),
      { timeout: 3000, interval: 20 },
    );
    expect((await f.poll(tab.id)).exitCode).toBe(0);
    await expect(
      f.send({ action: 'write', id: tab.id, data: 'blocked' }),
    ).rejects.toThrow('exited');
    await f.send({ action: 'kill', id: tab.id });
    expect(await f.send({ action: 'list' })).toEqual([]);
  } finally {
    delete process.env['AXIODEN_TERMINAL_TEST_TOKEN'];
    await f.close();
  }
});
it('terminates detached and signal-resistant descendants and closes every PTY', async () => {
  const f = await fixture();
  try {
    const tab = await f.create();
    await f.send({
      action: 'write',
      id: tab.id,
      data: "setsid /bin/sh -c 'trap \"\" HUP TERM; while :; do sleep 1; done' >/dev/null 2>&1 & printf '\\nTREE_READY\\n'\r",
    });
    await vi.waitFor(
      async () => {
        expect((await f.poll(tab.id)).data).toMatch(/\r?\nTREE_READY\r?\n/);
        expect(processTree(tab.pid).length).toBeGreaterThanOrEqual(4);
      },
      { timeout: 5000, interval: 20 },
    );
    const descendants = processTree(tab.pid);
    await f.send({ action: 'kill', id: tab.id });
    await vi.waitFor(
      () => {
        for (const pid of descendants)
          expect(() => process.kill(pid, 0)).toThrow();
      },
      { timeout: 3000, interval: 20 },
    );
    await f.create();
    await f.terminal.close();
    expect(await f.send({ action: 'list' }).catch(() => [])).toEqual([]);
  } finally {
    await f.close();
  }
});
it('enforces the tab limit under concurrent creation and fails closed when namespace support is missing', async () => {
  const f = await fixture();
  try {
    const tabs = await Promise.all(Array.from({ length: 6 }, () => f.create()));
    expect(tabs).toHaveLength(6);
    await expect(f.create()).rejects.toThrow('Six terminal tabs');
    await f.send({ action: 'kill', id: tabs[0]!.id });
    await f.create();
    expect(
      (await f.send({ action: 'list' })) as TerminalSummary[],
    ).toHaveLength(6);
    const unsupported = new TerminalService(
      f.workspaces,
      '/missing-bubblewrap',
    );
    await expect(
      unsupported.dispatch(
        terminalOperationSchema.parse({
          action: 'create',
          workspaceId: f.registered.id,
        }),
      ),
    ).rejects.toThrow('no terminal was opened');
    await unsupported.close();
  } finally {
    await f.close();
  }
});
