import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  directoryListSchema,
  workspaceFilesSchema,
  workspaceReadSchema,
  workspaceSearchSchema,
  workspaceGitStatusSchema,
  workspaceGitDiffSchema,
  workspaceGitCommitSchema,
  toAppError,
  type Directory,
  type FileEntry,
  type AppError,
} from '@harness/contracts';
import { useSettingsStore } from './settings';
import { useBackend } from '../transport/backend';
export const useWorkbenchStore = defineStore('workbench', () => {
  const backend = useBackend();
  const preferences = useSettingsStore();
  const directories = ref<Directory[]>([]);
  const directoryId = ref(preferences.settings.activeDirectory ?? '');
  const path = ref('');
  const entries = ref<FileEntry[]>([]);
  const text = ref('');
  const selectedFile = ref('');
  const branch = ref('');
  const mutationBusy = ref(false);
  const commitResult = ref('');
  const stagedView = ref(false);
  const changes = ref<Array<{ path: string; index: string; worktree: string }>>(
    [],
  );
  const matches = ref<Array<{ path: string; line: number; preview: string }>>(
    [],
  );
  const busy = ref(false);
  const error = ref<AppError | null>(null);
  const truncated = ref(false);
  let revision = 0;
  async function refresh() {
    try {
      directories.value = directoryListSchema.parse(
        await backend.workspace({ action: 'list' }),
      );
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function open() {
    try {
      const directory = await backend.openWorkspace();
      await refresh();
      if (directory) await select(directory.id);
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function select(id: string) {
    directoryId.value = id;
    await preferences.patch({ activeDirectory: id });
    selectedFile.value = '';
    text.value = '';
    branch.value = '';
    changes.value = [];
    await files('');
  }
  async function files(nextPath: string) {
    const current = ++revision;
    busy.value = true;
    try {
      const result = workspaceFilesSchema.parse(
        await backend.workspace({
          action: 'files',
          id: directoryId.value,
          path: nextPath,
        }),
      );
      if (current !== revision) return;
      entries.value = result.entries;
      path.value = nextPath;
      truncated.value = result.truncated;
      error.value = null;
    } catch (cause) {
      if (current === revision) error.value = toAppError(cause);
    } finally {
      if (current === revision) busy.value = false;
    }
  }
  async function read(file: string) {
    const current = ++revision;
    busy.value = true;
    try {
      const result = workspaceReadSchema.parse(
        await backend.workspace({
          action: 'read',
          id: directoryId.value,
          path: file,
        }),
      );
      if (current !== revision) return;
      text.value = result.text;
      selectedFile.value = result.path;
      error.value = null;
    } catch (cause) {
      if (current === revision) error.value = toAppError(cause);
    } finally {
      if (current === revision) busy.value = false;
    }
  }
  async function search(query: string) {
    if (!query.trim()) {
      matches.value = [];
      return;
    }
    const current = ++revision;
    busy.value = true;
    try {
      const result = workspaceSearchSchema.parse(
        await backend.workspace({
          action: 'search',
          id: directoryId.value,
          query,
        }),
      );
      if (current !== revision) return;
      matches.value = result.matches;
      truncated.value = result.truncated;
      error.value = null;
    } catch (cause) {
      if (current === revision) error.value = toAppError(cause);
    } finally {
      if (current === revision) busy.value = false;
    }
  }
  async function git(staged = false) {
    stagedView.value = staged;
    const current = ++revision;
    busy.value = true;
    try {
      const [status, diff] = await Promise.all([
        backend.workspace({ action: 'git.status', id: directoryId.value }),
        backend.workspace({
          action: 'git.diff',
          id: directoryId.value,
          staged,
        }),
      ]);
      if (current !== revision) return;
      const parsed = workspaceGitStatusSchema.parse(status);
      branch.value = parsed.branch;
      changes.value = parsed.entries;
      text.value = workspaceGitDiffSchema.parse(diff).text;
      selectedFile.value = staged ? 'Staged changes.diff' : 'Working tree.diff';
      error.value = null;
    } catch (cause) {
      if (current === revision) error.value = toAppError(cause);
    } finally {
      if (current === revision) busy.value = false;
    }
  }
  async function stage(file: string, staged: boolean) {
    if (mutationBusy.value) return;
    mutationBusy.value = true;
    try {
      await backend.workspace({
        action: staged ? 'git.stage' : 'git.unstage',
        id: directoryId.value,
        paths: [file],
      });
      await git(stagedView.value);
      error.value = null;
    } catch (cause) {
      error.value = toAppError(cause);
    } finally {
      mutationBusy.value = false;
    }
  }
  async function commit(message: string) {
    if (mutationBusy.value || !message.trim()) return false;
    mutationBusy.value = true;
    try {
      const result = workspaceGitCommitSchema.parse(
        await backend.workspace({
          action: 'git.commit',
          id: directoryId.value,
          message,
        }),
      );
      commitResult.value = `Created ${result.hash.slice(0, 8)} · ${result.summary}`;
      await git(stagedView.value);
      error.value = null;
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    } finally {
      mutationBusy.value = false;
    }
  }
  return {
    directories,
    directoryId,
    path,
    entries,
    text,
    selectedFile,
    branch,
    changes,
    matches,
    busy,
    error,
    truncated,
    refresh,
    open,
    select,
    files,
    read,
    search,
    git,
    stage,
    commit,
    mutationBusy,
    commitResult,
    stagedView,
  };
});
