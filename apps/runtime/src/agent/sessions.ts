import { agentRequestSchema, type AgentRequest } from '@harness/contracts';
import {
  createAgentSession,
  type AgentOptions,
  type AgentOutcome,
} from './engine';
import { AgentFailure } from './permissions';
export class AgentSessions {
  private sessions = new Map<string, ReturnType<typeof createAgentSession>>();
  constructor(private limit = 3) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 8)
      throw new Error('Invalid session resource limit.');
  }
  start(candidate: AgentRequest, options: AgentOptions): Promise<AgentOutcome> {
    const request = agentRequestSchema.parse(candidate);
    if (this.sessions.has(request.id) || this.sessions.size >= this.limit)
      throw new AgentFailure(
        'BUSY',
        'The active agent session limit was reached.',
      );
    const session = createAgentSession(request, {
      ...options,
      spawn: (child, childOptions) => this.start(child, childOptions),
    });
    this.sessions.set(request.id, session);
    return session.run().finally(() => this.sessions.delete(request.id));
  }
  cancel(id: string) {
    this.sessions.get(id)?.cancel();
  }
  async close() {
    const active = [...this.sessions.values()];
    for (const session of active) session.cancel();
    await Promise.allSettled(active.map((session) => session.run()));
  }
  get active() {
    return this.sessions.size;
  }
}
