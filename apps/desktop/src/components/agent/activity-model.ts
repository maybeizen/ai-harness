import type { AgentEvent } from '@harness/contracts';
export interface ActivityCard {
  key: string;
  title: string;
  body: string;
  tone: 'neutral' | 'error' | 'change' | 'command' | 'finding';
}
const commands = new Set(['execute_command', 'run_tests']);
const changes = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'apply_patch',
]);
function lines(value: unknown) {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (record['error'] && typeof record['error'] === 'object') {
    const error = record['error'] as { code?: string; message?: string };
    return [error.code, error.message].filter(Boolean).join(': ');
  }
  if (
    typeof record['stdout'] === 'string' ||
    typeof record['stderr'] === 'string'
  )
    return [
      typeof record['exitCode'] === 'number'
        ? `exit ${record['exitCode']}`
        : '',
      typeof record['stdout'] === 'string' ? record['stdout'] : '',
      typeof record['stderr'] === 'string' ? record['stderr'] : '',
    ]
      .filter(Boolean)
      .join('\n');
  if (Array.isArray(record['findings']))
    return record['findings']
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const finding = item as {
          severity?: string;
          file?: string;
          line?: number;
          evidence?: string;
        };
        return `${finding.severity ?? 'info'} ${finding.file ?? ''}:${finding.line ?? ''} ${finding.evidence ?? ''}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  if (typeof record['path'] === 'string')
    return [
      record['deleted'] === true ? `Deleted ${record['path']}` : record['path'],
      record['created'] === true ? 'Created' : '',
      typeof record['beforeHash'] === 'string'
        ? `before ${record['beforeHash'].slice(0, 12)}`
        : '',
      typeof record['hash'] === 'string'
        ? `after ${record['hash'].slice(0, 12)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  return Object.entries(record)
    .filter(([, item]) => item == null || typeof item !== 'object')
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join('\n');
}
export function activityCards(events: AgentEvent[]) {
  const cards: ActivityCard[] = [];
  const tools = new Map<string, ActivityCard>();
  for (const event of events) {
    if (event.type === 'text' || event.type === 'approval') continue;
    if (event.type === 'status') {
      cards.push({
        key: `status-${event.step}-${cards.length}`,
        title: `Task ${event.status}`,
        body: event.message,
        tone: event.status === 'error' ? 'error' : 'neutral',
      });
    } else if (event.type === 'subtask') {
      cards.push({
        key: `${event.childSessionId}:${event.status}`,
        title: event.title,
        body: event.status,
        tone: event.status === 'error' ? 'error' : 'neutral',
      });
    } else if (event.type === 'tool') {
      const card: ActivityCard = {
        key: event.callId,
        title: `${event.name} · ${event.status}`,
        body: '',
        tone: commands.has(event.name)
          ? 'command'
          : changes.has(event.name)
            ? 'change'
            : 'neutral',
      };
      tools.set(event.callId, card);
      cards.push(card);
    } else if (event.type === 'result') {
      const body = lines(event.output);
      const tone = !event.ok
        ? 'error'
        : commands.has(event.name)
          ? 'command'
          : changes.has(event.name)
            ? 'change'
            : event.name === 'report_findings'
              ? 'finding'
              : 'neutral';
      const existing = tools.get(event.callId);
      if (existing) {
        existing.title = `${event.name} · ${event.ok ? 'completed' : 'failed'}`;
        existing.body = body;
        existing.tone = tone;
      } else
        cards.push({
          key: `${event.callId}:result`,
          title: event.name,
          body,
          tone,
        });
    }
  }
  return cards;
}
export function completionSummary(events: AgentEvent[]) {
  const text = events
    .filter((event) => event.type === 'text')
    .map((event) => event.text)
    .join('');
  const status = [...events]
    .reverse()
    .find((event) => event.type === 'status' && event.status !== 'running');
  const message = status?.type === 'status' ? status.message : '';
  return [message, text].filter(Boolean).join('\n\n');
}
export const taskStatusLabel: Record<string, string> = {
  reserved: 'Reserved',
  running: 'Running',
  completed: 'Completed',
  cancelled: 'Cancelled',
  error: 'Failed',
  limited: 'Limited',
  resumable: 'Interrupted',
};
