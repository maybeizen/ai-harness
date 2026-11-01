import { agentRequestSchema, type AgentRequest } from '@harness/contracts';
import { Approvals } from './permissions';
import { runSession } from './session-run';
export type { AgentOptions, AgentOutcome, AuditRecord } from './types';
import type { AgentOptions, AgentOutcome } from './types';
export function createAgentSession(
  candidate: AgentRequest,
  options: AgentOptions,
) {
  const request = agentRequestSchema.parse(candidate);
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const approvals = new Approvals();
  let running: Promise<AgentOutcome> | undefined;
  return {
    request,
    run: () =>
      (running ??= runSession(request, options, controller, signal, approvals)),
    cancel: () => controller.abort(),
    signal,
  };
}
