import { expect, it } from 'vitest';
import type { AgentEvent } from '@harness/contracts';
import { activityCards, completionSummary } from './activity-model';
const sessionId = '00000000-0000-4000-8000-000000000001';
const events: AgentEvent[] = [
  {
    type: 'status',
    sessionId,
    status: 'running',
    step: 1,
    message: 'Working in the approved workspace.',
  },
  {
    type: 'tool',
    sessionId,
    callId: 'run-1',
    name: 'run_tests',
    status: 'running',
  },
  {
    type: 'result',
    sessionId,
    callId: 'run-1',
    name: 'run_tests',
    ok: true,
    output: { stdout: 'ok', stderr: '', exitCode: 0 },
  },
  {
    type: 'result',
    sessionId,
    callId: 'patch-1',
    name: 'apply_patch',
    ok: true,
    output: { path: 'a.txt', hash: 'ab'.repeat(32), created: true },
  },
  {
    type: 'result',
    sessionId,
    callId: 'find-1',
    name: 'report_findings',
    ok: true,
    output: {
      findings: [
        {
          severity: 'high',
          file: 'a.txt',
          line: 2,
          evidence: 'missing check',
        },
      ],
    },
  },
  {
    type: 'result',
    sessionId,
    callId: 'bad-1',
    name: 'write_file',
    ok: false,
    output: { error: { code: 'FILE_CONFLICT', message: 'changed' } },
  },
  { type: 'text', sessionId, text: 'Finished the task.' },
  {
    type: 'status',
    sessionId,
    status: 'completed',
    step: 2,
    message: 'The agent finished.',
  },
];
it('renders task, command, change, finding, and error cards without raw event json', () => {
  const cards = activityCards(events);
  expect(cards.map((card) => card.title)).toEqual([
    'Task running',
    'run_tests · completed',
    'apply_patch',
    'report_findings',
    'write_file',
    'Task completed',
  ]);
  expect(cards.find((card) => card.tone === 'command')?.body).toContain('ok');
  expect(cards.find((card) => card.tone === 'change')?.body).toContain('a.txt');
  expect(cards.find((card) => card.tone === 'finding')?.body).toContain(
    'missing check',
  );
  expect(cards.find((card) => card.tone === 'error')?.body).toContain(
    'FILE_CONFLICT',
  );
  expect(JSON.stringify(cards)).not.toContain('"type":"result"');
  expect(completionSummary(events)).toContain('Finished the task.');
});
