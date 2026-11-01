import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod';
import {
  projectSchema,
  directorySchema,
  toAppError,
  type Project,
  type Directory,
  type AppError,
} from '@harness/contracts';
import { useBackend } from '../transport/backend';
import { useChatStore } from './chat';
export const useProjectsStore = defineStore('projects', () => {
  const backend = useBackend();
  const chat = useChatStore();
  const projects = ref<Project[]>([]);
  const directories = ref<Directory[]>([]);
  const error = ref<AppError | null>(null);
  const busy = ref(false);
  async function refresh() {
    try {
      const [saved, roots] = await Promise.all([
        backend.storage({ action: 'project.list', includeArchived: true }),
        backend.workspace({ action: 'list' }),
      ]);
      projects.value = z
        .array(projectSchema.omit({ instructions: true }))
        .parse(saved)
        .map((project) => ({ ...project, instructions: '' }));
      directories.value = z.array(directorySchema).parse(roots);
      error.value = null;
    } catch (cause) {
      error.value = toAppError(cause);
    }
  }
  async function openDirectory() {
    if (busy.value) return null;
    busy.value = true;
    try {
      const selected = await backend.openWorkspace();
      await refresh();
      return selected;
    } catch (cause) {
      error.value = toAppError(cause);
      return null;
    } finally {
      busy.value = false;
    }
  }
  async function get(id: string) {
    return projectSchema.parse(
      await backend.storage({ action: 'project.get', id }),
    );
  }
  async function save(
    project: Omit<Project, 'id' | 'updatedAt'> & { id?: string },
  ) {
    try {
      const { id, ...configuration } = project;
      if (id)
        await backend.storage({
          action: 'project.update',
          project: { ...configuration, id },
        });
      else
        await backend.storage({
          action: 'project.create',
          project: configuration,
        });
      await refresh();
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    }
  }
  async function remove(id: string) {
    try {
      await backend.storage({ action: 'project.delete', id });
      await refresh();
      await chat.refreshHistory();
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    }
  }
  async function associate(
    projectId: string | null,
    directoryId: string | null,
  ) {
    try {
      await backend.storage({
        action: 'conversation.associate',
        id: chat.conversationId,
        projectId,
        directoryId,
      });
      await chat.refreshHistory();
      return true;
    } catch (cause) {
      error.value = toAppError(cause);
      return false;
    }
  }
  return {
    projects,
    directories,
    error,
    busy,
    refresh,
    openDirectory,
    get,
    save,
    remove,
    associate,
  };
});
