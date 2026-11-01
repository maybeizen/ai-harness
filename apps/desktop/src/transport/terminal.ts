import { invoke } from '@tauri-apps/api/core';
import { inject, hasInjectionContext, type InjectionKey } from 'vue';
import {
  terminalOperationSchema,
  type TerminalOperation,
} from '@harness/contracts';
export interface TerminalBackend {
  create(workspaceId: string, shell?: string): Promise<unknown>;
  operation(
    operation: Exclude<TerminalOperation, { action: 'create' }>,
  ): Promise<unknown>;
}
export const terminalBackendKey: InjectionKey<TerminalBackend> =
  Symbol('terminal-backend');
const native: TerminalBackend = {
  create: (workspaceId, shell = '') =>
    invoke('create_terminal', { workspaceId, shell }),
  operation: (operation) =>
    invoke('terminal_operation', {
      operation: terminalOperationSchema.parse(operation),
    }),
};
export function useTerminalBackend() {
  return hasInjectionContext() ? inject(terminalBackendKey, native) : native;
}
