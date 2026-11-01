import { randomUUID } from 'node:crypto';
import { agentToolSchemas, type AgentRequest } from '@harness/contracts';
import type { ProviderTool } from '@harness/providers';
import { AgentFailure } from './permissions';
import type { AgentOptions } from './types';
export function providerTools(
  request: AgentRequest,
  options: AgentOptions,
): ProviderTool[] {
  const tools: ProviderTool[] = options.toolbox.definitions(request);
  if (request.mode === 'multitask' && options.spawn)
    tools.push({
      name: 'delegate_tasks',
      description:
        'Run up to three independent agent tasks in separate contexts. Two children run concurrently; all inherit this workspace and permission policy. Children cannot delegate further. Avoid conflicting edits.',
      inputSchema: agentToolSchemas.delegate_tasks,
    });
  return tools;
}
export async function delegate(
  request: AgentRequest,
  input: unknown,
  options: AgentOptions,
  signal: AbortSignal,
) {
  const parsed = agentToolSchemas.delegate_tasks.safeParse(input);
  if (!parsed.success || !options.spawn)
    throw new AgentFailure('INVALID_TOOL_CALL', 'Invalid delegated task list.');
  const tasks = parsed.data.tasks;
  const outcomes: Array<{
    sessionId: string;
    status: string;
    summary: string;
  }> = [];
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      signal.throwIfAborted();
      const index = next++;
      const task = tasks[index]!;
      const id = randomUUID();
      let summary = '';
      await options.emit({
        type: 'subtask',
        sessionId: request.id,
        childSessionId: id,
        title: task.prompt.slice(0, 200),
        status: 'running',
      });
      try {
        const outcome = await options.spawn!(
          {
            ...request,
            id,
            mode: 'agent',
            prompt: task.prompt,
            maxSteps: Math.min(request.maxSteps, 8),
          },
          {
            kind: options.kind,
            modelId: options.modelId,
            credential: options.credential,
            ...(options.baseURL ? { baseURL: options.baseURL } : {}),
            toolbox: options.toolbox,
            ...(options.context ? { context: options.context } : {}),
            ...(options.turn ? { turn: options.turn } : {}),
            approve: options.approve,
            audit: options.audit,
            signal,
            emit: async (event) => {
              if (event.type === 'text')
                summary = (summary + event.text).slice(0, 12000);
              await options.emit(event);
            },
          },
        );
        outcomes[index] = {
          sessionId: id,
          status: outcome.status,
          summary: summary || outcome.message,
        };
      } catch (error) {
        signal.throwIfAborted();
        outcomes[index] = {
          sessionId: id,
          status: 'error',
          summary:
            error instanceof AgentFailure
              ? error.message
              : 'The delegated task could not start.',
        };
      }
      const result = outcomes[index];
      await options.emit({
        type: 'subtask',
        sessionId: request.id,
        childSessionId: id,
        title: task.prompt.slice(0, 200),
        status: result.status as
          'completed' | 'cancelled' | 'error' | 'limited',
      });
    }
  };
  await Promise.all([worker(), worker()]);
  return { tasks: outcomes };
}
