import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  agentPatchSchema,
  toAppError,
  workspaceGitSidesSchema,
  type AppError,
} from '@harness/contracts';
import { useBackend } from '../transport/backend';
import { useAgentBackend } from '../transport/agent';
export const useDiffReviewStore = defineStore('diff-review', () => {
  const backend = useBackend();
  const agents = useAgentBackend();
  const workspaceId = ref('');
  const path = ref('');
  const staged = ref(false);
  const original = ref('');
  const modified = ref('');
  const patch = ref(false);
  const conflict = ref(false);
  const busy = ref(false);
  const error = ref<AppError | null>(null);
  async function open(id: string, file: string, stagedView: boolean) {
    workspaceId.value = id;
    path.value = file;
    staged.value = stagedView;
    busy.value = true;
    error.value = null;
    try {
      const saved = agentPatchSchema.parse(
        await agents.operation({
          action: 'patch.read',
          workspaceId: id,
          path: file,
        }),
      );
      if (saved) {
        original.value = saved.before;
        modified.value = saved.after;
        patch.value = true;
        conflict.value =
          saved.currentHash !== null && saved.currentHash !== saved.afterHash;
      } else {
        const sides = workspaceGitSidesSchema.parse(
          await backend.workspace({
            action: 'git.sides',
            id,
            path: file,
            staged: stagedView,
          }),
        );
        original.value = sides.original;
        modified.value = sides.modified;
        patch.value = false;
        conflict.value = false;
      }
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = false;
    }
  }
  async function accept() {
    if (!patch.value || busy.value) return;
    busy.value = true;
    try {
      await agents.operation({
        action: 'patch.accept',
        workspaceId: workspaceId.value,
        path: path.value,
      });
      patch.value = false;
      conflict.value = false;
      error.value = null;
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      busy.value = false;
    }
  }
  async function rollback() {
    if (!patch.value || conflict.value || busy.value) return false;
    busy.value = true;
    try {
      await agents.operation({
        action: 'patch.rollback',
        workspaceId: workspaceId.value,
        path: path.value,
        confirmed: true,
      });
      patch.value = false;
      error.value = null;
      await open(workspaceId.value, path.value, staged.value);
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    } finally {
      busy.value = false;
    }
  }
  return {
    workspaceId,
    path,
    original,
    modified,
    patch,
    conflict,
    busy,
    error,
    open,
    accept,
    rollback,
  };
});
