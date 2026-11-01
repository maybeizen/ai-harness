<script setup lang="ts">
import { onMounted } from 'vue';
import { useProjectsStore } from '../../stores/projects';
import { useSettingsStore } from '../../stores/settings';
import { Button } from '../ui/button';
const projects = useProjectsStore();
const preferences = useSettingsStore();
onMounted(() => {
  void projects.refresh();
});
</script>
<template>
  <section
    class="setting-section"
    aria-labelledby="workspaces-settings-heading"
  >
    <div>
      <h3 id="workspaces-settings-heading" class="text-sm font-semibold">
        Workspaces
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        These are the projects and directories already registered on this
        computer.
      </p>
    </div>
    <p v-if="projects.error" role="alert" class="text-xs text-destructive">
      {{ projects.error.message }}
    </p>
    <div>
      <h4 class="text-sm font-medium">Directories</h4>
      <p
        v-if="!projects.directories.length"
        class="mt-2 text-xs text-muted-foreground"
      >
        No directories are open.
      </p>
      <ul v-else class="mt-2 grid gap-2">
        <li
          v-for="directory in projects.directories"
          :key="directory.id"
          class="flex items-center justify-between gap-3 text-xs"
        >
          <span class="min-w-0"
            ><span class="block truncate font-medium">{{ directory.name }}</span
            ><span class="block truncate text-muted-foreground">{{
              directory.path
            }}</span></span
          ><Button
            size="sm"
            variant="outline"
            @click="preferences.patch({ activeDirectory: directory.id })"
            >{{
              preferences.settings.activeDirectory === directory.id
                ? 'Active'
                : 'Use'
            }}</Button
          >
        </li>
      </ul>
    </div>
    <div>
      <h4 class="text-sm font-medium">Projects</h4>
      <p
        v-if="!projects.projects.length"
        class="mt-2 text-xs text-muted-foreground"
      >
        No projects are saved.
      </p>
      <ul v-else class="mt-2 grid gap-2">
        <li
          v-for="project in projects.projects"
          :key="project.id"
          class="text-xs"
        >
          <span class="font-medium">{{ project.name }}</span>
          <span v-if="project.archived" class="text-muted-foreground">
            archived</span
          >
        </li>
      </ul>
    </div>
    <Button
      variant="outline"
      :disabled="projects.busy"
      @click="projects.openDirectory()"
      >Open directory</Button
    >
  </section>
</template>
