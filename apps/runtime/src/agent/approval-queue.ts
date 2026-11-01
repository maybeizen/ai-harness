import {
  approvalDecisionSchema,
  type Approval,
  type ApprovalDecision,
} from '@harness/contracts';
import { AgentFailure } from './permissions';
interface Waiting {
  approval: Approval;
  settle: (decision?: ApprovalDecision, error?: Error) => void;
}
export class ApprovalQueue {
  private waiting = new Map<string, Waiting>();
  wait(approval: Approval, signal: AbortSignal): Promise<ApprovalDecision> {
    signal.throwIfAborted();
    if (this.waiting.has(approval.id) || this.waiting.size >= 256)
      throw new AgentFailure('BUSY', 'Approval capacity was reached.');
    return new Promise((resolve, reject) => {
      const abort = () =>
        settle(
          undefined,
          new AgentFailure('CANCELLED', 'The approval request was cancelled.'),
        );
      const timer = setTimeout(
        () =>
          settle(
            undefined,
            new AgentFailure(
              'PERMISSION_DENIED',
              'The approval request expired.',
            ),
          ),
        Math.max(1, approval.expiresAt - Date.now()),
      );
      timer.unref();
      const settle = (decision?: ApprovalDecision, error?: Error) => {
        this.waiting.delete(approval.id);
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else if (decision) resolve(decision);
        else
          reject(
            new AgentFailure(
              'PERMISSION_DENIED',
              'The approval request was denied.',
            ),
          );
      };
      this.waiting.set(approval.id, { approval, settle });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  decide(candidate: ApprovalDecision) {
    const decision = approvalDecisionSchema.parse(candidate);
    const pending = this.waiting.get(decision.id);
    if (
      !pending ||
      pending.approval.requestHash !== decision.requestHash ||
      pending.approval.expiresAt <= Date.now()
    )
      throw new AgentFailure(
        'PERMISSION_DENIED',
        'This approval is unknown, expired, changed or already resolved.',
      );
    pending.settle(decision);
  }
  close() {
    for (const pending of [...this.waiting.values()])
      pending.settle(
        undefined,
        new AgentFailure('CANCELLED', 'The application is closing.'),
      );
  }
}
