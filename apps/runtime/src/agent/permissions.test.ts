import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { agentRequestSchema } from '@harness/contracts';
import { Approvals, needsApproval } from './permissions';
const request = () =>
  agentRequestSchema.parse({
    id: randomUUID(),
    workspaceId: randomUUID(),
    mode: 'agent',
    policy: 'manual',
    prompt: 'Fix it',
  });
it('binds approvals to exact operation, session, policy, expiry and single use', () => {
  let time = 100;
  const approvals = new Approvals(() => time);
  const input = request();
  const call = {
    id: 'call',
    name: 'write_file',
    input: { path: 'a.ts', text: 'safe', expectedHash: null },
  };
  const item = approvals.issue(input, call, 'Write a.ts');
  expect(() =>
    approvals.consume(
      input,
      { ...call, input: { ...call.input, text: 'changed' } },
      { id: item.id, requestHash: item.requestHash, decision: 'allow' },
    ),
  ).toThrow('changed');
  expect(() =>
    approvals.consume(input, call, {
      id: item.id,
      requestHash: item.requestHash,
      decision: 'allow',
    }),
  ).toThrow('already used');
  const expired = approvals.issue(input, call, 'Write');
  time += 60001;
  expect(() =>
    approvals.consume(input, call, {
      id: expired.id,
      requestHash: expired.requestHash,
      decision: 'allow',
    }),
  ).toThrow('expired');
  const valid = approvals.issue(input, call, 'Write');
  approvals.consume(input, call, {
    id: valid.id,
    requestHash: valid.requestHash,
    decision: 'allow',
  });
  expect(() =>
    approvals.consume(input, call, {
      id: valid.id,
      requestHash: valid.requestHash,
      decision: 'allow',
    }),
  ).toThrow('already used');
});
it('keeps analysis modes read-only and command/delete approval mandatory under full policy', () => {
  for (const mode of ['ask', 'plan', 'review', 'security'] as const)
    expect(() =>
      needsApproval({ ...request(), mode }, 'write_file', 'write'),
    ).toThrow('cannot modify');
  expect(
    needsApproval({ ...request(), policy: 'automatic' }, 'read_file', 'read'),
  ).toBe(false);
  expect(
    needsApproval({ ...request(), policy: 'automatic' }, 'write_file', 'write'),
  ).toBe(true);
  expect(
    needsApproval({ ...request(), policy: 'full' }, 'write_file', 'write'),
  ).toBe(false);
  expect(
    needsApproval({ ...request(), policy: 'full' }, 'delete_file', 'delete'),
  ).toBe(true);
  expect(
    needsApproval(
      { ...request(), policy: 'full' },
      'execute_command',
      'execute',
    ),
  ).toBe(true);
  const edit = { ...request(), mode: 'edit' as const };
  expect(needsApproval(edit, 'write_file', 'write')).toBe(true);
  expect(needsApproval(edit, 'apply_patch', 'write')).toBe(true);
  expect(
    needsApproval({ ...edit, policy: 'full' }, 'delete_file', 'delete'),
  ).toBe(true);
  expect(
    needsApproval({ ...edit, policy: 'full' }, 'write_file', 'write'),
  ).toBe(false);
  expect(() => needsApproval(edit, 'run_tests', 'execute')).toThrow('command');
  expect(() =>
    needsApproval({ ...edit, policy: 'full' }, 'execute_command', 'execute'),
  ).toThrow('command');
  expect(
    needsApproval({ ...request(), policy: 'full' }, 'mcp_echo', 'external'),
  ).toBe(true);
  expect(
    needsApproval({ ...edit, policy: 'full' }, 'mcp_echo', 'external'),
  ).toBe(true);
  expect(() =>
    needsApproval({ ...request(), mode: 'ask' }, 'mcp_echo', 'external'),
  ).toThrow('external MCP');
  expect(() =>
    needsApproval({ ...request(), mode: 'security' }, 'mcp_echo', 'external'),
  ).toThrow('external MCP');
});
it('automatically permits only bounded new documentation text when enabled', () => {
  const input = { ...request(), policy: 'automatic' as const };
  const document = {
    path: 'docs/new.md',
    text: 'Safe documentation',
    expectedHash: null,
  };
  expect(needsApproval(input, 'write_file', 'write', document)).toBe(false);
  expect(
    needsApproval(input, 'write_file', 'write', {
      ...document,
      path: 'notes/nested/idea.txt',
    }),
  ).toBe(false);
  expect(
    needsApproval(
      { ...input, automaticCreateText: false },
      'write_file',
      'write',
      document,
    ),
  ).toBe(true);
  expect(
    needsApproval(input, 'write_file', 'write', {
      ...document,
      expectedHash: '0'.repeat(64),
    }),
  ).toBe(true);
  expect(
    needsApproval(input, 'write_file', 'write', {
      ...document,
      path: 'src/new.ts',
    }),
  ).toBe(true);
  expect(
    needsApproval(input, 'write_file', 'write', {
      ...document,
      text: '🌈'.repeat(10000),
    }),
  ).toBe(true);
  expect(
    needsApproval(input, 'write_file', 'write', {
      ...document,
      path: 'docs/../src/new.md',
    }),
  ).toBe(true);
  expect(() =>
    needsApproval({ ...input, mode: 'ask' }, 'write_file', 'write', document),
  ).toThrow('cannot modify');
});
