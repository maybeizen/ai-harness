import type { AgentRequest } from '@harness/contracts';
import { providerError, type ProviderMessage } from '@harness/providers';
import {
  AgentFailure,
  type Approvals,
  needsApproval,
  requestHash,
  type ToolCall,
} from './permissions';
import { delegate } from './delegation';
import { abortable } from './signals';
import type { AgentOptions } from './types';
export interface SessionScratch {
  groups: ProviderMessage[][];
  queued: ToolCall[];
  assistant: ProviderMessage[];
  findingsReported: boolean;
}
export interface CallContext {
  request: AgentRequest;
  options: AgentOptions;
  signal: AbortSignal;
  approvals: Approvals;
  scratch: SessionScratch;
  repetitions: Map<string, number>;
  remember: () => Promise<void>;
}
function boundedOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  return Buffer.byteLength(serialized) <= 32768
    ? value
    : {
        truncated: true,
        preview: serialized.slice(0, 6000),
        message:
          'Tool output exceeded the context limit. Request narrower context.',
      };
}
async function execute(context: CallContext, call: ToolCall) {
  const { request, options, signal, approvals } = context;
  if (
    call.name === 'delegate_tasks' &&
    request.mode === 'multitask' &&
    options.spawn
  )
    return delegate(request, call.input, options, signal);
  const parsed = options.toolbox.validate(request, call.name, call.input);
  const normalized: ToolCall = { ...call, input: parsed.input };
  if (
    needsApproval(request, call.name, parsed.definition.effect, parsed.input)
  ) {
    await context.remember();
    const approval = approvals.issue(
      request,
      normalized,
      `${parsed.definition.approvalLabel ?? call.name}\n${JSON.stringify(parsed.input, null, 2)}`,
    );
    await options.emit({ type: 'approval', sessionId: request.id, approval });
    try {
      approvals.consume(
        request,
        normalized,
        await abortable(options.approve(approval, signal), signal),
      );
    } finally {
      approvals.discard(approval.id);
    }
  }
  signal.throwIfAborted();
  await options.audit({
    sessionId: request.id,
    workspaceId: request.workspaceId,
    callId: call.id,
    tool: call.name,
    status: 'allowed',
    at: Date.now(),
  });
  await options.emit({
    type: 'tool',
    sessionId: request.id,
    callId: call.id,
    name: call.name,
    status: 'running',
  });
  return options.toolbox.execute(request, call.name, parsed.input, signal);
}
async function finishCall(context: CallContext, call: ToolCall) {
  const signature = requestHash(context.request, { ...call, id: '' });
  const repeated = (context.repetitions.get(signature) ?? 0) + 1;
  context.repetitions.set(signature, repeated);
  if (repeated > 3)
    throw new AgentFailure(
      'LOOP_LIMIT',
      'The agent repeated the same operation too many times.',
    );
  let output: unknown;
  let ok = true;
  let failureCode: string | undefined;
  try {
    output = boundedOutput(await execute(context, call));
    if (ok && call.name === 'report_findings')
      context.scratch.findingsReported = true;
  } catch (error) {
    context.signal.throwIfAborted();
    ok = false;
    const detail =
      error instanceof AgentFailure
        ? { code: error.code, message: error.message }
        : providerError(error);
    failureCode = detail.code;
    output = { error: detail };
  }
  await context.options.audit({
    sessionId: context.request.id,
    workspaceId: context.request.workspaceId,
    callId: call.id,
    tool: call.name,
    status: ok
      ? 'completed'
      : failureCode === 'PERMISSION_DENIED'
        ? 'denied'
        : 'failed',
    ...(failureCode ? { code: failureCode } : {}),
    at: Date.now(),
  });
  await context.options.emit({
    type: 'result',
    sessionId: context.request.id,
    callId: call.id,
    name: call.name,
    ok,
    output,
  });
  return {
    type: 'tool-result' as const,
    toolCallId: call.id,
    toolName: call.name,
    output: { type: 'json' as const, value: output },
  };
}
export async function drainCalls(
  context: CallContext,
  calls: ToolCall[],
  prior: ProviderMessage[],
) {
  const results = [];
  context.scratch.assistant = [...prior];
  context.scratch.queued = [...calls];
  await context.remember();
  for (const call of calls) {
    results.push(await finishCall(context, call));
    context.scratch.queued = context.scratch.queued.filter(
      (item) => item.id !== call.id,
    );
    await context.remember();
  }
  context.scratch.groups.push([
    ...prior,
    { role: 'tool', content: results } as ProviderMessage,
  ]);
  context.scratch.assistant = [];
  context.scratch.queued = [];
  await context.remember();
}
