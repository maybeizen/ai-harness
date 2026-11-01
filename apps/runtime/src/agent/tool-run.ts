import {
  readToolResultSchema,
  type AgentRequest,
  type Directory,
} from '@harness/contracts';
import { AgentFailure, automaticTextCreationAllowed } from './permissions';
import { hashText, type PathLocks } from './paths';
import {
  mutate,
  type WriteInput,
  type EditInput,
  type DeleteInput,
} from './mutations';
import { applyPatch } from './patch';
import { projectMetadata } from './metadata';
import type { PatchStore } from './patch-store';
import type { IsolatedExecutor, WorkspaceAccess } from './toolbox';
export async function runTool(input: {
  request: AgentRequest;
  name: string;
  args: Record<string, unknown>;
  directory: Directory;
  workspaces: WorkspaceAccess;
  executor?: IsolatedExecutor;
  locks: PathLocks;
  patches?: PatchStore;
  signal: AbortSignal;
}) {
  const { name, args, directory, signal } = input;
  if (name === 'read_file') {
    const result = readToolResultSchema.parse(
      await input.workspaces.dispatch(
        { action: 'read', id: directory.id, path: args['path'] as string },
        signal,
      ),
    );
    return { ...result, hash: hashText(result.text) };
  }
  if (name === 'list_directory')
    return input.workspaces.dispatch(
      { action: 'files', id: directory.id, path: args['path'] as string },
      signal,
    );
  if (name === 'search')
    return input.workspaces.dispatch(
      { action: 'search', id: directory.id, query: args['query'] as string },
      signal,
    );
  if (name === 'git_status')
    return input.workspaces.dispatch(
      { action: 'git.status', id: directory.id },
      signal,
    );
  if (name === 'git_diff')
    return input.workspaces.dispatch(
      {
        action: 'git.diff',
        id: directory.id,
        staged: args['staged'] as boolean,
      },
      signal,
    );
  if (name === 'project_metadata') {
    const relative = args['path'];
    return projectMetadata(
      directory.path,
      typeof relative === 'string' ? relative : '',
    );
  }
  if (name === 'report_findings') return { findings: args['findings'] };
  if (name === 'execute_command' || name === 'run_tests') {
    if (!input.executor?.isolated)
      throw new AgentFailure(
        'ISOLATION_UNAVAILABLE',
        name === 'run_tests'
          ? 'Test commands require bubblewrap. No command was run.'
          : 'No isolated executor is configured.',
      );
    return input.executor.execute(
      {
        command: args['command'] as string,
        timeoutMs: args['timeoutMs'] as number,
        root: directory.path,
      },
      signal,
    );
  }
  if (name === 'apply_patch') {
    if (!input.patches)
      throw new AgentFailure('STORAGE_ERROR', 'Patch history is unavailable.');
    return applyPatch({
      root: directory.path,
      workspaceId: input.request.workspaceId,
      sessionId: input.request.id,
      path: args['path'] as string,
      expectedHash: args['expectedHash'] as string | null,
      patch: args['patch'] as string,
      signal,
      locks: input.locks,
      store: input.patches,
    });
  }
  return mutate(
    directory.path,
    name,
    args as unknown as WriteInput | EditInput | DeleteInput,
    signal,
    input.locks,
    automaticTextCreationAllowed(input.request, name, args),
  );
}
