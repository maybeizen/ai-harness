import { it, expect } from 'vitest';
import { agentRequestSchema } from '@harness/contracts';
import { Approvals } from './permissions';
const request = agentRequestSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  mode: 'agent',
  policy: 'manual',
  prompt: 'task',
});
it('retains the entire reviewable operation instead of hiding its tail', () => {
  const summary = 'review ' + 'x'.repeat(9000) + ' FINAL_EFFECT';
  const approval = new Approvals().issue(
    request,
    { id: 'call', name: 'write_file', input: { text: summary } },
    summary,
  );
  expect(approval.summary).toBe(summary);
  expect(approval.summary.endsWith('FINAL_EFFECT')).toBe(true);
});
it('rejects operations beyond the encoded review budget before granting an approval', () => {
  const approvals = new Approvals();
  expect(() =>
    approvals.issue(
      request,
      { id: 'call', name: 'write_file', input: {} },
      '\\'.repeat(20000),
    ),
  ).toThrow('too large to review');
});
