<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { FolderOpen, File, Folder, ArrowUp, X } from '@lucide/vue';
import { useSettingsStore } from '../../stores/settings';
import { useWorkbenchStore } from '../../stores/workbench';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import NativeSelect from '../ui/NativeSelect.vue';
import GitChanges from './GitChanges.vue';
import DiffReview from './DiffReview.vue';
import TerminalPanel from './TerminalPanel.vue';
import CodeViewer from './CodeViewer.vue';
const emit = defineEmits<{ close: [] }>();
const work = useWorkbenchStore();
const preferences = useSettingsStore();
const dragWidth = ref<number | null>(null);
const panelWidth = computed(
  () => dragWidth.value ?? preferences.settings.rightPanelWidth,
);
let dragStart = 0;
let initialWidth = 0;
function startResize(event: PointerEvent) {
  dragStart = event.clientX;
  initialWidth = panelWidth.value;
  dragWidth.value = initialWidth;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
}
function resize(event: PointerEvent) {
  if (dragWidth.value !== null)
    dragWidth.value = Math.min(
      800,
      Math.max(320, initialWidth + dragStart - event.clientX),
    );
}
function finishResize() {
  if (dragWidth.value !== null) {
    void preferences.patch({ rightPanelWidth: dragWidth.value });
    dragWidth.value = null;
  }
}

const tab = ref<'files' | 'git' | 'terminal'>('files');
const query = ref('');
onMounted(() => {
  void work.refresh().then(() => {
    if (work.directoryId) void work.select(work.directoryId);
  });
});
function parent() {
  void work.files(work.path.split('/').slice(0, -1).join('/'));
}
</script>
<template>
  <aside
    class="absolute inset-0 z-30 flex h-full min-h-0 min-w-80 flex-1 flex-col border-l bg-background md:relative md:inset-auto"
    :style="{ width: panelWidth + 'px', flex: '0 0 auto' }"
    aria-label="Workspace files and Git"
  >
    <div
      role="separator"
      aria-label="Workspace panel width"
      aria-orientation="vertical"
      tabindex="0"
      :aria-valuenow="panelWidth"
      :aria-valuemin="320"
      :aria-valuemax="800"
      class="absolute top-0 left-0 z-10 hidden h-full w-1.5 cursor-col-resize hover:bg-primary/30 md:block"
      @pointerdown="startResize"
      @pointermove="resize"
      @pointerup="finishResize"
      @pointercancel="finishResize"
      @keydown.left.prevent="
        preferences.patch({ rightPanelWidth: Math.min(800, panelWidth + 20) })
      "
      @keydown.right.prevent="
        preferences.patch({ rightPanelWidth: Math.max(320, panelWidth - 20) })
      "
    />
    <header
      class="flex h-[var(--toolbar-height,4rem)] shrink-0 items-center justify-between gap-2 border-b px-3"
    >
      <h2 class="text-xs font-semibold">Workspace</h2>
      <div class="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open workspace folder"
          @click="work.open"
          ><FolderOpen class="size-4" /></Button
        ><Button
          variant="ghost"
          size="icon"
          aria-label="Close workspace panel"
          @click="emit('close')"
          ><X class="size-4"
        /></Button>
      </div>
    </header>
    <div class="grid gap-2 border-b p-3">
      <label for="workspace-directory" class="sr-only"
        >Workspace directory</label
      ><NativeSelect
        id="workspace-directory"
        :model-value="work.directoryId"
        @update:model-value="work.select($event)"
        ><option value="" disabled>Select a directory</option>
        <option
          v-for="directory in work.directories"
          :key="directory.id"
          :value="directory.id"
        >
          {{ directory.name }}{{ directory.available ? '' : ' (missing)' }}
        </option></NativeSelect
      >
      <div v-if="work.directoryId" class="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          :aria-pressed="tab === 'files'"
          @click="
            tab = 'files';
            work.files(work.path);
          "
          >Files</Button
        ><Button
          variant="ghost"
          size="sm"
          :aria-pressed="tab === 'git'"
          @click="
            tab = 'git';
            work.git();
          "
          >Git changes</Button
        ><Button
          variant="ghost"
          size="sm"
          :aria-pressed="tab === 'terminal'"
          @click="tab = 'terminal'"
          >Terminal</Button
        >
      </div>
    </div>
    <p
      v-if="!work.directoryId"
      class="p-5 text-xs leading-5 text-muted-foreground"
    >
      Open a local directory to browse files, search code and inspect Git
      changes.
    </p>
    <p v-if="work.error" role="alert" class="p-3 text-xs text-destructive">
      {{ work.error.message }}
    </p>
    <template v-if="work.directoryId"
      ><form
        v-if="tab === 'files'"
        class="flex gap-2 border-b p-3"
        @submit.prevent="work.search(query)"
      >
        <Input
          v-model="query"
          aria-label="Search workspace contents"
          placeholder="Search code…"
          maxlength="256"
        /><Button
          type="submit"
          variant="outline"
          size="sm"
          :disabled="work.busy || !query.trim()"
          >Search</Button
        >
      </form>
      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="tab === 'files'" class="border-b p-2">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              :disabled="!work.path"
              aria-label="Parent directory"
              @click="parent"
              ><ArrowUp class="size-3.5" /></Button
            ><span class="truncate font-mono text-xs">{{
              work.path || '/'
            }}</span>
          </div>
          <button
            v-for="entry in work.entries"
            :key="entry.path"
            class="flex min-h-[var(--row-height)] w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted"
            :disabled="entry.kind === 'symlink'"
            @click="
              entry.kind === 'directory'
                ? work.files(entry.path)
                : work.read(entry.path)
            "
          >
            <Folder v-if="entry.kind === 'directory'" class="size-3.5" /><File
              v-else
              class="size-3.5"
            /><span class="truncate">{{ entry.name }}</span
            ><span v-if="entry.kind === 'symlink'" class="text-muted-foreground"
              >symbolic link</span
            >
          </button>
          <button
            v-for="match in work.matches"
            :key="`${match.path}:${match.line}`"
            class="block w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted"
            @click="work.read(match.path)"
          >
            {{ match.path }}:{{ match.line }} {{ match.preview }}
          </button>
        </div>
        <template v-else-if="tab === 'git'"
          ><GitChanges /><DiffReview /></template
        ><TerminalPanel v-else class="h-[65svh]" />
        <p
          v-if="work.busy"
          role="status"
          class="p-3 text-xs text-muted-foreground"
        >
          Loading…
        </p>
        <p v-if="work.truncated" class="p-3 text-xs text-muted-foreground">
          Results reached the display limit. Narrow the search or open a
          subdirectory.
        </p>
        <div
          v-if="work.selectedFile && tab !== 'terminal'"
          class="h-[min(65svh,40rem)] min-h-60"
        >
          <h3 class="truncate border-b px-3 py-2 font-mono text-xs">
            {{ work.selectedFile }}
          </h3>
          <CodeViewer :text="work.text" :path="work.selectedFile" />
        </div></div
    ></template>
  </aside>
</template>
