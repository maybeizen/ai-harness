import type {
  AgentRequest,
  AgentEvent,
  Approval,
  ApprovalDecision,
} from '@harness/contracts';
import type { ProviderTurnInput, ProviderTurnEvent } from '@harness/providers';
import type { Toolbox } from './toolbox';
import type { AgentCheckpoint } from './checkpoint';
export interface AuditRecord {
  sessionId: string;
  callId: string;
  workspaceId: string;
  tool: string;
  status: 'allowed' | 'denied' | 'completed' | 'failed';
  at: number;
  code?: string;
}
export interface AgentOptions {
  kind: ProviderTurnInput['kind'];
  modelId: string;
  credential: string;
  baseURL?: string;
  toolbox: Toolbox;
  checkpoint?: AgentCheckpoint;
  onCheckpoint?: (checkpoint: AgentCheckpoint) => Promise<void>;
  context?: string;
  emit: (event: AgentEvent) => Promise<void>;
  approve: (
    approval: Approval,
    signal: AbortSignal,
  ) => Promise<ApprovalDecision>;
  audit: (record: AuditRecord) => Promise<void>;
  turn?: (input: ProviderTurnInput) => AsyncIterable<ProviderTurnEvent>;
  signal?: AbortSignal;
  spawn?: (
    request: AgentRequest,
    options: AgentOptions,
  ) => Promise<AgentOutcome>;
}
export interface AgentOutcome {
  status: 'completed' | 'cancelled' | 'error' | 'limited';
  steps: number;
  message: string;
}
