import type {
  AgentEvent,
  AgentRequest,
  AgentStatus,
  AgentSummary,
  Approval,
  ConnectionKind,
  WorkspaceOperation,
} from '@harness/contracts';
import type { AgentBackend } from '../src/transport/agent';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const requestHash = 'a'.repeat(64);
const beforeHash = 'b'.repeat(64);
const afterHash = 'c'.repeat(64);
const original = 'export const value = 1;\n';
const modified = 'export const value = 2;\n';
export const fixtureDirectory = {
  id: workspaceId,
  name: 'Fixture workspace',
  path: '/fixture/workspace',
  available: true,
};
type WorkspaceCall = Exclude<WorkspaceOperation, { action: 'register' }>;
export const fixtureWorkspace = {
  directory: fixtureDirectory,
  handle(operation: WorkspaceCall) {
    switch (operation.action) {
      case 'list':
        return Promise.resolve([fixtureDirectory]);
      case 'files':
        return Promise.resolve({
          entries: [
            { name: 'src', path: 'src', kind: 'directory' as const, size: 0 },
            {
              name: 'app.ts',
              path: 'src/app.ts',
              kind: 'file' as const,
              size: modified.length,
            },
          ],
          truncated: false,
        });
      case 'read':
        return Promise.resolve({ path: operation.path, text: modified });
      case 'search':
        return Promise.resolve({ matches: [], truncated: false });
      case 'git.status':
        return Promise.resolve({
          root: fixtureDirectory.path,
          branch: 'fixture',
          entries: [{ path: 'src/app.ts', index: ' ', worktree: 'M' }],
        });
      case 'git.diff':
        return Promise.resolve({
          text: '--- a/src/app.ts\n+++ b/src/app.ts\n-export const value = 1;\n+export const value = 2;\n',
          staged: operation.staged,
        });
      case 'git.sides':
        return Promise.resolve({
          path: operation.path,
          original,
          modified,
          staged: operation.staged,
        });
      case 'git.stage':
      case 'git.unstage':
        return Promise.resolve(null);
      case 'git.commit':
        return Promise.resolve({
          hash: 'd'.repeat(40),
          summary: operation.message,
          hooksRun: false as const,
          signed: false as const,
        });
    }
  },
};
interface Task {
  id: string;
  workspaceId: string;
  mode: AgentSummary['mode'];
  policy: AgentSummary['policy'];
  prompt: string;
  status: AgentStatus;
  createdAt: number;
  events: AgentEvent[];
  approval?: Approval;
  connectionId?: ConnectionKind;
  modelId?: string;
}
const tasks = new Map<string, Task>();
function push(task: Task, event: AgentEvent) {
  task.events.push(event);
}
function summary(task: Task): AgentSummary {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    mode: task.mode,
    policy: task.policy,
    promptPreview: task.prompt.slice(0, 200),
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.createdAt,
  };
}
function finish(task: Task, message: string) {
  push(task, {
    type: 'status',
    sessionId: task.id,
    status: 'completed',
    step: task.events.length + 1,
    message,
  });
  task.status = 'completed';
}
function begin(
  request: AgentRequest,
  connectionId: ConnectionKind,
  modelId: string,
) {
  const task: Task = {
    id: request.id,
    workspaceId: request.workspaceId,
    mode: request.mode,
    policy: request.policy,
    prompt: request.prompt,
    status: 'running',
    createdAt: Date.now(),
    events: [],
    connectionId,
    modelId,
  };
  const prompt = request.prompt.toLowerCase();
  if (prompt.includes('analyze')) {
    push(task, {
      type: 'text',
      sessionId: task.id,
      text: 'Fixture analysis found one suggested edit.',
    });
    finish(task, 'Analysis finished.');
  } else if (prompt.includes('edit')) {
    const approval: Approval = {
      id: crypto.randomUUID(),
      sessionId: task.id,
      callId: 'edit-1',
      workspaceId: request.workspaceId,
      requestHash,
      tool: 'edit_file',
      summary: 'Replace the fixture return value in src/app.ts',
      expiresAt: Date.now() + 60_000,
    };
    task.approval = approval;
    push(task, {
      type: 'tool',
      sessionId: task.id,
      callId: approval.callId,
      name: 'edit_file',
      status: 'pending',
    });
    push(task, { type: 'approval', sessionId: task.id, approval });
  } else if (prompt.includes('test')) {
    push(task, {
      type: 'tool',
      sessionId: task.id,
      callId: 'test-1',
      name: 'run_tests',
      status: 'running',
    });
    push(task, {
      type: 'result',
      sessionId: task.id,
      callId: 'test-1',
      name: 'run_tests',
      ok: true,
      output: { exitCode: 0, stdout: '1 fixture test passed', stderr: '' },
    });
    finish(task, 'Fixture tests finished.');
  } else if (prompt.includes('slow')) {
    push(task, {
      type: 'text',
      sessionId: task.id,
      text: 'Fixture task is still running.',
    });
  } else finish(task, 'Fixture task finished.');
  tasks.set(task.id, task);
}
function poll(id: string, after: number) {
  const task = tasks.get(id);
  if (!task)
    return { id, status: 'error' as const, events: [], nextCursor: after };
  const pending = task.events
    .map((event, index) => ({ sequence: index + 1, event }))
    .filter((record) => record.sequence > after);
  const events = pending.slice(0, 20);
  return {
    id,
    status: task.status,
    events,
    nextCursor: events.at(-1)?.sequence ?? after,
  };
}
export const fixtureAgent: AgentBackend = {
  start: (request, connectionId, modelId) => {
    begin(request, connectionId, modelId);
    return Promise.resolve();
  },
  resume: (id, connectionId, modelId) => {
    const task = tasks.get(id);
    if (task) {
      task.status = 'running';
      task.connectionId = connectionId;
      task.modelId = modelId;
    }
    return Promise.resolve();
  },
  operation: (operation) => {
    switch (operation.action) {
      case 'list':
        return Promise.resolve([...tasks.values()].map(summary));
      case 'poll':
        return Promise.resolve(poll(operation.id, operation.after));
      case 'cancel': {
        const task = tasks.get(operation.id);
        if (task && task.status !== 'cancelled') {
          task.status = 'cancelled';
          push(task, {
            type: 'status',
            sessionId: task.id,
            status: 'cancelled',
            step: task.events.length + 1,
            message: 'Cancelled from the fixture.',
          });
        }
        return Promise.resolve(null);
      }
      case 'approve': {
        const task = [...tasks.values()].find(
          (item) =>
            item.approval?.id === operation.decision.id &&
            item.approval.requestHash === operation.decision.requestHash,
        );
        if (task?.approval && task.status === 'running') {
          push(task, {
            type: 'result',
            sessionId: task.id,
            callId: task.approval.callId,
            name: 'edit_file',
            ok: operation.decision.decision === 'allow',
            output: {
              path: 'src/app.ts',
              beforeHash,
              hash: afterHash,
            },
          });
          finish(
            task,
            operation.decision.decision === 'allow'
              ? 'Edit applied in the fixture.'
              : 'Edit denied in the fixture.',
          );
        }
        return Promise.resolve(null);
      }
      case 'patch.read':
        return Promise.resolve(
          operation.path === 'src/app.ts'
            ? {
                path: operation.path,
                before: original,
                after: modified,
                beforeHash,
                afterHash,
                currentHash: afterHash,
              }
            : null,
        );
      case 'patch.list':
        return Promise.resolve([{ path: 'src/app.ts', beforeHash, afterHash }]);
      case 'patch.accept':
      case 'patch.rollback':
        return Promise.resolve(null);
      default:
        return Promise.resolve(null);
    }
  },
};
