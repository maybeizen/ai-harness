import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentRequestSchema, type AgentMode } from '@harness/contracts';
import { Toolbox } from './toolbox';
import { LinuxExecutor } from './isolated-executor';
const request = (mode: AgentMode) =>
  agentRequestSchema.parse({
    id: randomUUID(),
    workspaceId: randomUUID(),
    mode,
    policy: 'manual',
    prompt: 'Inspect',
  });
const access = {
  get: (id: string) =>
    Promise.resolve({ id, path: '/tmp', name: 'fixture', available: true }),
  dispatch: () => Promise.resolve({ entries: [] }),
};
function names(mode: AgentMode, executor?: LinuxExecutor) {
  return new Toolbox(access, executor)
    .definitions(request(mode))
    .map((tool) => tool.name);
}
it('keeps edit on approved file changes and commands isolated to agent modes', () => {
  const executor = new LinuxExecutor('/missing/bwrap');
  for (const mode of ['ask', 'plan', 'review', 'security'] as const) {
    const tools = names(mode, executor);
    expect(tools).not.toContain('write_file');
    expect(tools).not.toContain('apply_patch');
    expect(tools).not.toContain('run_tests');
    expect(tools).not.toContain('execute_command');
  }
  expect(names('review', executor)).toContain('report_findings');
  expect(names('security', executor)).toContain('report_findings');
  expect(names('agent', executor)).not.toContain('report_findings');
  const edit = names('edit', executor);
  expect(edit).toEqual(
    expect.arrayContaining([
      'read_file',
      'write_file',
      'edit_file',
      'delete_file',
      'apply_patch',
      'project_metadata',
    ]),
  );
  expect(edit).not.toContain('run_tests');
  expect(edit).not.toContain('execute_command');
  for (const mode of ['agent', 'multitask', 'debug'] as const) {
    const tools = names(mode, executor);
    expect(tools).toContain('run_tests');
    expect(tools).toContain('execute_command');
    expect(tools).toContain('apply_patch');
  }
  expect(names('agent')).not.toContain('run_tests');
});
it('fails closed when bubblewrap is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-tests-'));
  const box = new Toolbox(
    {
      get: (id) =>
        Promise.resolve({ id, path: root, name: 'fixture', available: true }),
      dispatch: () => Promise.resolve({}),
    },
    new LinuxExecutor('/missing/bwrap'),
  );
  try {
    await expect(
      box.execute(
        request('agent'),
        'run_tests',
        { command: 'true' },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/[Bb]ubblewrap|isolation/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
