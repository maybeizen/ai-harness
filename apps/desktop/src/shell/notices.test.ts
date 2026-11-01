import { expect, it, vi } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import { deliverNotice, noticesForChange } from './notices';
const preferences = settingsSchema.parse({}).notifications;
it('does not send a notification when suppressed or the system call fails', async () => {
  const send = vi.fn(() => Promise.resolve());
  const playSound = vi.fn(() => Promise.resolve());
  expect(
    await deliverNotice(
      {
        kind: 'errors',
        title: 'Failed',
        body: 'Disk full',
        preferences: { ...preferences, doNotDisturb: true },
      },
      { send, playSound },
    ),
  ).toMatchObject({ delivered: false, reason: 'do-not-disturb', sound: false });
  expect(
    await deliverNotice(
      {
        kind: 'approvalRequests',
        title: 'Approve',
        body: 'Waiting',
        preferences: { ...preferences, approvalRequests: false },
      },
      { send, playSound },
    ),
  ).toMatchObject({ delivered: false, reason: 'disabled' });
  expect(send).not.toHaveBeenCalled();
  send.mockRejectedValueOnce(new Error('permission denied'));
  expect(
    await deliverNotice(
      { kind: 'errors', title: 'Failed', body: 'Disk full', preferences },
      { send, playSound },
    ),
  ).toMatchObject({ delivered: false, reason: 'unavailable', sound: false });
  expect(playSound).not.toHaveBeenCalled();
});
it('plays sound only after a real delivery', async () => {
  const send = vi.fn(() => Promise.resolve());
  const playSound = vi.fn(() => Promise.reject(new Error('silent')));
  expect(
    await deliverNotice(
      {
        kind: 'taskCompletion',
        title: 'Done',
        body: 'Finished',
        preferences: { ...preferences, sound: true },
      },
      { send, playSound },
    ),
  ).toMatchObject({ delivered: true, sound: false });
  expect(send).toHaveBeenCalledOnce();
  expect(playSound).toHaveBeenCalledOnce();
});
it('emits task, approval, and error notices from real transitions', () => {
  const previous = {
    agentStatus: 'running',
    approvalIds: [] as string[],
    chatError: null,
    runtimeError: null,
  };
  expect(noticesForChange(null, previous)).toEqual([]);
  expect(
    noticesForChange(previous, {
      ...previous,
      agentStatus: 'completed',
      approvalIds: ['approval'],
      chatError: 'The reply stopped.',
    }).map((notice) => notice.kind),
  ).toEqual(['taskCompletion', 'approvalRequests', 'errors']);
});
