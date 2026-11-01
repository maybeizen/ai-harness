import type { Readable, Writable } from 'node:stream';
import { agentToolSchemas } from '@harness/contracts';
import type {
  Directory,
  AgentRequest,
  WorkspaceOperation,
} from '@harness/contracts';
import type { ProviderTool } from '@harness/providers';
import { AgentFailure } from './permissions';
import { PathLocks } from './paths';
import { runTool } from './tool-run';
import type { PatchStore } from './patch-store';
export interface WorkspaceAccess {
  get(id: string): Promise<Directory>;
  dispatch(
    operation: WorkspaceOperation,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
export interface IsolatedStdio {
  stdin: Writable;
  stdout: Readable;
  close(): Promise<void>;
}
export interface IsolatedExecutor {
  readonly isolated: true;
  execute(
    input: { command: string; timeoutMs: number; root: string },
    signal: AbortSignal,
  ): Promise<unknown>;
  openStdio?(
    input: { command: string; args: string[]; timeoutMs: number; root: string },
    signal: AbortSignal,
  ): Promise<IsolatedStdio>;
}
export interface ToolDefinition extends ProviderTool {
  effect: 'read' | 'write' | 'delete' | 'execute' | 'external';
  approvalLabel?: string;
}
export interface ExternalEffects {
  definitions(request: Pick<AgentRequest, 'mode'>): ToolDefinition[];
  execute(name: string, input: unknown, signal: AbortSignal): Promise<unknown>;
}
const definitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      'Read an approved workspace UTF-8 file. Returns content and its SHA-256 hash for conflict-safe editing.',
    inputSchema: agentToolSchemas.read_file,
    effect: 'read',
  },
  {
    name: 'list_directory',
    description:
      'List files inside the approved workspace. Sensitive files are excluded.',
    inputSchema: agentToolSchemas.list_directory,
    effect: 'read',
  },
  {
    name: 'search',
    description:
      'Search ordinary workspace filenames and text with bounded output.',
    inputSchema: agentToolSchemas.search,
    effect: 'read',
  },
  {
    name: 'git_status',
    description: 'Inspect current Git status without modifying the repository.',
    inputSchema: agentToolSchemas.git_status,
    effect: 'read',
  },
  {
    name: 'git_diff',
    description:
      'Read a bounded Git diff without running configured external diff programs.',
    inputSchema: agentToolSchemas.git_diff,
    effect: 'read',
  },
  {
    name: 'write_file',
    description:
      'Create or replace a file. expectedHash must match the last read; use null only for a new file.',
    inputSchema: agentToolSchemas.write_file,
    effect: 'write',
  },
  {
    name: 'edit_file',
    description:
      'Replace exactly one occurrence of oldText after checking the last-read SHA-256 hash.',
    inputSchema: agentToolSchemas.edit_file,
    effect: 'write',
  },
  {
    name: 'delete_file',
    description:
      'Delete one inspected file after matching its SHA-256 hash. Always requires approval.',
    inputSchema: agentToolSchemas.delete_file,
    effect: 'delete',
  },
  {
    name: 'apply_patch',
    description:
      'Apply one unified diff to a workspace file after its SHA-256 matches expectedHash. Null means a new file. The previous bytes can be rolled back until the file changes.',
    inputSchema: agentToolSchemas.apply_patch,
    effect: 'write',
  },
  {
    name: 'project_metadata',
    description:
      'Read package, Cargo, Python, or Go manifest names from the workspace. Sensitive paths and symbolic links are refused.',
    inputSchema: agentToolSchemas.project_metadata,
    effect: 'read',
  },
  {
    name: 'report_findings',
    description:
      'Return structured review findings. Each finding includes severity, file, line, and evidence.',
    inputSchema: agentToolSchemas.report_findings,
    effect: 'read',
  },
];
const fileModes = new Set(['edit', 'agent', 'multitask', 'debug']);
const commandModes = new Set(['agent', 'multitask', 'debug']);
const findingModes = new Set(['review', 'security']);
export class Toolbox {
  constructor(
    private workspaces: WorkspaceAccess,
    private executor?: IsolatedExecutor,
    private locks = new PathLocks(),
    private patches?: PatchStore,
    private external?: ExternalEffects,
  ) {}
  definitions(request: AgentRequest): ToolDefinition[] {
    const available = definitions.filter((item) => {
      if (item.name === 'report_findings')
        return findingModes.has(request.mode);
      if (item.effect === 'read') return true;
      return fileModes.has(request.mode);
    });
    if (this.executor?.isolated && commandModes.has(request.mode)) {
      available.push(
        {
          name: 'execute_command',
          description:
            'Run an explicitly approved command in the configured isolated workspace executor. Approval is always required.',
          inputSchema: agentToolSchemas.execute_command,
          effect: 'execute',
        },
        {
          name: 'run_tests',
          description:
            'Run an approved test command in the isolated bubblewrap executor. Fails closed when bubblewrap is missing.',
          inputSchema: agentToolSchemas.run_tests,
          effect: 'execute',
        },
      );
    }
    const reserve = request.mode === 'multitask' ? 1 : 0;
    const remote = (this.external?.definitions(request) ?? [])
      .filter((tool) => tool.effect === 'external')
      .slice(0, Math.max(0, 64 - reserve - available.length));
    available.push(...remote);
    return available;
  }
  validate(request: AgentRequest, name: string, input: unknown) {
    const definition = this.definitions(request).find(
      (item) => item.name === name,
    );
    if (!definition)
      throw new AgentFailure(
        'PERMISSION_DENIED',
        'This tool is unavailable in the selected mode.',
      );
    const parsed = definition.inputSchema.safeParse(input);
    if (!parsed.success)
      throw new AgentFailure(
        'INVALID_TOOL_CALL',
        'The tool arguments are invalid.',
      );
    return { definition, input: parsed.data as Record<string, unknown> };
  }
  async execute(
    request: AgentRequest,
    name: string,
    input: unknown,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const validated = this.validate(request, name, input);
    const directory = await this.workspaces.get(request.workspaceId);
    if (!directory.available)
      throw new AgentFailure(
        'WORKSPACE_UNAVAILABLE',
        'The workspace is unavailable.',
      );
    if (validated.definition.effect === 'external') {
      if (!this.external)
        throw new AgentFailure(
          'PERMISSION_DENIED',
          'External tools are unavailable.',
        );
      return this.external.execute(name, validated.input, signal);
    }
    return runTool({
      request,
      name,
      args: validated.input,
      directory,
      workspaces: this.workspaces,
      ...(this.executor ? { executor: this.executor } : {}),
      locks: this.locks,
      ...(this.patches ? { patches: this.patches } : {}),
      signal,
    });
  }
}
