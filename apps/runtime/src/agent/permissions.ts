import { createHash, randomUUID } from 'node:crypto';
import {
  approvalDecisionSchema,
  type AgentRequest,
  type Approval,
  type ApprovalDecision,
} from '@harness/contracts';
export class AgentFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}
export function requestHash(request: AgentRequest, call: ToolCall) {
  return createHash('sha256')
    .update(
      canonical({
        session: request.id,
        workspace: request.workspaceId,
        mode: request.mode,
        policy: request.policy,
        automaticCreateText: request.automaticCreateText,
        call,
      }),
    )
    .digest('hex');
}
export function automaticDocumentPath(path: string) {
  return /^(?:docs|notes)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:md|txt)$/i.test(
    path,
  );
}
export function automaticTextCreationAllowed(
  request: AgentRequest,
  name: string,
  input?: Record<string, unknown>,
) {
  return (
    request.policy === 'automatic' &&
    request.automaticCreateText &&
    name === 'write_file' &&
    input?.['expectedHash'] === null &&
    typeof input['path'] === 'string' &&
    automaticDocumentPath(input['path']) &&
    typeof input['text'] === 'string' &&
    Buffer.byteLength(input['text']) <= 32768
  );
}
const fileModes = new Set(['edit', 'agent', 'multitask', 'debug']);
const commandModes = new Set(['agent', 'multitask', 'debug']);
export function needsApproval(
  request: AgentRequest,
  name: string,
  effect: 'read' | 'write' | 'delete' | 'execute' | 'external',
  input?: Record<string, unknown>,
) {
  if (effect === 'external') {
    if (!fileModes.has(request.mode))
      throw new AgentFailure(
        'PERMISSION_DENIED',
        `${request.mode} mode cannot use external MCP tools.`,
      );
    return true;
  }
  if (effect === 'execute' && !commandModes.has(request.mode))
    throw new AgentFailure(
      'PERMISSION_DENIED',
      `${request.mode} mode cannot run commands.`,
    );
  if (effect !== 'read' && effect !== 'execute' && !fileModes.has(request.mode))
    throw new AgentFailure(
      'PERMISSION_DENIED',
      `${request.mode} mode cannot modify files or execute commands.`,
    );
  if (effect === 'read') return false;
  if (effect === 'delete' || effect === 'execute') return true;
  return (
    request.policy !== 'full' &&
    !automaticTextCreationAllowed(request, name, input)
  );
}
export class Approvals {
  private pending = new Map<string, Approval>();
  constructor(private now = () => Date.now()) {}
  issue(request: AgentRequest, call: ToolCall, summary: string): Approval {
    for (const [id, item] of this.pending)
      if (item.expiresAt <= this.now()) this.pending.delete(id);
    if (this.pending.size >= 256)
      throw new AgentFailure('BUSY', 'Too many pending approvals.');
    if (Buffer.byteLength(JSON.stringify(summary)) > 32768)
      throw new AgentFailure(
        'APPROVAL_LIMIT',
        'This operation is too large to review safely. Request smaller edits or arguments.',
      );
    const approval: Approval = {
      id: randomUUID(),
      sessionId: request.id,
      workspaceId: request.workspaceId,
      callId: call.id,
      tool: call.name,
      summary,
      requestHash: requestHash(request, call),
      expiresAt: this.now() + 60000,
    };
    this.pending.set(approval.id, approval);
    return approval;
  }
  consume(request: AgentRequest, call: ToolCall, decision: ApprovalDecision) {
    const parsed = approvalDecisionSchema.safeParse(decision);
    if (!parsed.success)
      throw new AgentFailure('PERMISSION_DENIED', 'Invalid approval decision.');
    const item = this.pending.get(parsed.data.id);
    this.pending.delete(parsed.data.id);
    if (
      !item ||
      item.expiresAt <= this.now() ||
      item.requestHash !== parsed.data.requestHash ||
      item.requestHash !== requestHash(request, call) ||
      parsed.data.decision !== 'allow'
    )
      throw new AgentFailure(
        'PERMISSION_DENIED',
        'Approval was denied, expired, changed or already used.',
      );
  }
  discard(id: string) {
    this.pending.delete(id);
  }
}
