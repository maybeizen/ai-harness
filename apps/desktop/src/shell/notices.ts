import type { NotificationPreferences } from '@harness/contracts';
export type NoticeKind = 'taskCompletion' | 'approvalRequests' | 'errors';
export interface NoticeRequest {
  kind: NoticeKind;
  title: string;
  body: string;
  preferences: NotificationPreferences;
}
export interface NoticeSnapshot {
  agentStatus: string | null;
  approvalIds: string[];
  chatError: string | null;
  runtimeError: string | null;
}
export function noticeDecision(request: NoticeRequest) {
  if (request.preferences.doNotDisturb)
    return { deliver: false as const, reason: 'do-not-disturb' as const };
  if (!request.preferences[request.kind])
    return { deliver: false as const, reason: 'disabled' as const };
  return { deliver: true as const, sound: request.preferences.sound };
}
export async function deliverNotice(
  request: NoticeRequest,
  effects: {
    send: () => Promise<void>;
    playSound: () => Promise<void>;
  },
) {
  const decision = noticeDecision(request);
  if (!decision.deliver)
    return { delivered: false, reason: decision.reason, sound: false };
  try {
    await effects.send();
  } catch {
    return { delivered: false, reason: 'unavailable' as const, sound: false };
  }
  if (!decision.sound)
    return { delivered: true, reason: 'delivered' as const, sound: false };
  try {
    await effects.playSound();
    return { delivered: true, reason: 'delivered' as const, sound: true };
  } catch {
    return { delivered: true, reason: 'delivered' as const, sound: false };
  }
}
export function noticesForChange(
  previous: NoticeSnapshot | null,
  next: NoticeSnapshot,
) {
  if (!previous) return [];
  const notices: { kind: NoticeKind; title: string; body: string }[] = [];
  if (
    previous.agentStatus === 'running' &&
    (next.agentStatus === 'completed' || next.agentStatus === 'limited')
  )
    notices.push({
      kind: 'taskCompletion',
      title: 'Task finished',
      body: 'An agent task finished.',
    });
  if (previous.agentStatus === 'running' && next.agentStatus === 'error')
    notices.push({
      kind: 'errors',
      title: 'Task failed',
      body: 'An agent task failed.',
    });
  for (const id of next.approvalIds)
    if (!previous.approvalIds.includes(id))
      notices.push({
        kind: 'approvalRequests',
        title: 'Approval needed',
        body: 'An agent task is waiting for approval.',
      });
  if (next.chatError && next.chatError !== previous.chatError)
    notices.push({
      kind: 'errors',
      title: 'Conversation error',
      body: next.chatError,
    });
  if (next.runtimeError && next.runtimeError !== previous.runtimeError)
    notices.push({
      kind: 'errors',
      title: 'Runtime error',
      body: next.runtimeError,
    });
  return notices;
}
