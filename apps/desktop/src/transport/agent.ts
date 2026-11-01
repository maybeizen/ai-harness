import { invoke } from '@tauri-apps/api/core';
import { inject, hasInjectionContext, type InjectionKey } from 'vue';
import {
  agentRequestSchema,
  agentOperationSchema,
  agentPollSchema,
  agentSummarySchema,
  type AgentRequest,
  type AgentOperation,
  type ConnectionKind,
} from '@harness/contracts';
import { z } from 'zod';
export interface AgentBackend {
  start(
    request: AgentRequest,
    connectionId: ConnectionKind,
    modelId: string,
  ): Promise<void>;
  resume(
    id: string,
    connectionId: ConnectionKind,
    modelId: string,
  ): Promise<void>;
  operation(
    operation: Exclude<AgentOperation, { action: 'start' | 'reserve' }>,
  ): Promise<unknown>;
}
export const agentBackendKey: InjectionKey<AgentBackend> =
  Symbol('agent-backend');
const native: AgentBackend = {
  start: (request, connectionId, modelId) =>
    invoke('start_agent', {
      request: agentRequestSchema.parse(request),
      connectionId,
      modelId,
    }),
  resume: (id, connectionId, modelId) =>
    invoke('resume_agent', { id, connectionId, modelId }),
  operation: (operation) =>
    invoke('agent_operation', {
      operation: agentOperationSchema.parse(operation),
    }),
};
export function useAgentBackend() {
  return hasInjectionContext() ? inject(agentBackendKey, native) : native;
}
export { agentPollSchema };
export const agentListSchema = z.array(agentSummarySchema);
