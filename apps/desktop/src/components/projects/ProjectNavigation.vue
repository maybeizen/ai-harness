<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ChevronRight, FolderOpen, Plus, Settings2, Trash2 } from '@lucide/vue';
import { useProjectsStore } from '../../stores/projects';
import { useChatStore } from '../../stores/chat';
import { useSettingsStore } from '../../stores/settings';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import ProjectEditor from './ProjectEditor.vue';
const projects = useProjectsStore();
const chat = useChatStore();
const preferences = useSettingsStore();
function toggle(group: 'projects' | 'directories') {
  void preferences.patch({
    sidebarGroups: {
      ...preferences.settings.sidebarGroups,
      [group]: !preferences.settings.sidebarGroups[group],
    },
  });
}
const editing = ref(false);
const projectId = ref<string>();
const deleting = ref<string | null>(null);
onMounted(() => {
  void projects.refresh();
});
function create() {
  projectId.value = undefined;
  editing.value = true;
}
function edit(id: string) {
  projectId.value = id;
  editing.value = true;
}
async function remove() {
  if (deleting.value && (await projects.remove(deleting.value)))
    deleting.value = null;
}
async function directory() {
  const root = await projects.openDirectory();
  if (root) await chat.filterHistory({ kind: 'directory', id: root.id });
}
</script>
<template>
  <nav
    aria-label="Projects and directories"
    class="grid gap-2 px-3 pb-3 text-xs"
  >
    <div class="flex items-center justify-between gap-1">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 font-medium text-muted-foreground"
        :aria-expanded="preferences.settings.sidebarGroups.projects"
        @click="toggle('projects')"
      >
        <ChevronRight
          class="size-3.5 transition-transform"
          :class="
            preferences.settings.sidebarGroups.projects ? 'rotate-90' : ''
          "
        />Projects
      </button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        aria-label="Create project"
        @click="create"
        ><Plus class="size-3.5"
      /></Button>
    </div>
    <template v-if="preferences.settings.sidebarGroups.projects">
      <div
        v-for="project in projects.projects"
        :key="project.id"
        class="group flex min-w-0 items-center gap-1"
      >
        <button
          class="min-h-[var(--row-height)] min-w-0 flex-1 truncate rounded px-2 text-left hover:bg-sidebar-accent"
          @click="chat.filterHistory({ kind: 'project', id: project.id })"
        >
          {{ project.pinned ? '★ ' : '' }}{{ project.name
          }}{{ project.archived ? ' · archived' : '' }}
        </button>
        <Button
          variant="ghost"
          size="icon"
          class="size-6"
          :aria-label="`Settings for ${project.name}`"
          @click="edit(project.id)"
          ><Settings2 class="size-3"
        /></Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-6"
          :aria-label="`Delete project ${project.name}`"
          @click="deleting = project.id"
          ><Trash2 class="size-3"
        /></Button>
      </div>
    </template>
    <p
      v-if="
        preferences.settings.sidebarGroups.projects && !projects.projects.length
      "
      class="px-2 py-1 text-muted-foreground"
    >
      No projects yet.
    </p>
    <div class="flex items-center justify-between gap-1">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 font-medium text-muted-foreground"
        :aria-expanded="preferences.settings.sidebarGroups.directories"
        @click="toggle('directories')"
      >
        <ChevronRight
          class="size-3.5 transition-transform"
          :class="
            preferences.settings.sidebarGroups.directories ? 'rotate-90' : ''
          "
        />Directories
      </button>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        aria-label="Open directory"
        :disabled="projects.busy"
        @click="directory"
        ><FolderOpen class="size-3.5"
      /></Button>
    </div>
    <template v-if="preferences.settings.sidebarGroups.directories">
      <button
        v-for="root in projects.directories"
        :key="root.id"
        class="min-h-[var(--row-height)] truncate rounded px-2 text-left hover:bg-sidebar-accent"
        :title="root.path"
        @click="chat.filterHistory({ kind: 'directory', id: root.id })"
      >
        {{ root.name }}{{ root.available ? '' : ' · missing' }}
      </button>
    </template>
    <div class="grid gap-1 border-t pt-2">
      <Button
        variant="ghost"
        class="justify-start text-xs"
        @click="chat.filterHistory({ kind: 'general' })"
        >General chats</Button
      ><Button
        variant="ghost"
        class="justify-start text-xs"
        @click="chat.filterHistory({ kind: 'all' })"
        >All conversations</Button
      ><Button
        variant="ghost"
        class="justify-start text-xs"
        @click="chat.filterHistory({ kind: 'archived' })"
        >Archived sessions</Button
      >
    </div>
    <p v-if="projects.error" role="alert" class="text-destructive">
      {{ projects.error.message }}
    </p>
    <ProjectEditor v-model="editing" :project-id="projectId" />
    <Dialog
      :open="!!deleting"
      @update:open="
        (value) => {
          if (!value) deleting = null;
        }
      "
      ><DialogContent
        ><DialogHeader
          ><DialogTitle>Delete project?</DialogTitle
          ><DialogDescription
            >The project settings will be removed. Its conversations remain
            available under General chats.</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="deleting = null">Cancel</Button
          ><Button variant="destructive" @click="remove"
            >Delete project</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </nav>
</template>
