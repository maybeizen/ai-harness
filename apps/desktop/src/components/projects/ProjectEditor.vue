<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  agentModes,
  connectionKinds,
  connectionLabels,
  projectSchema,
  toAppError,
  type AgentMode,
  type Project,
} from '@harness/contracts';
import { useProjectsStore } from '../../stores/projects';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import NativeSelect from '../ui/NativeSelect.vue';
import { Button } from '../ui/button';
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ projectId?: string | undefined }>();
const projects = useProjectsStore();
const draft = ref<Omit<Project, 'id' | 'updatedAt'>>({
  name: '',
  directoryId: null,
  instructions: '',
  preferredProvider: null,
  preferredModel: '',
  defaultMode: null,
  pinned: false,
  archived: false,
});
const busy = ref(false);
watch(open, async (value) => {
  if (!value) return;
  if (props.projectId) {
    try {
      draft.value = projectSchema
        .omit({ id: true, updatedAt: true })
        .strip()
        .parse(await projects.get(props.projectId));
    } catch (cause) {
      projects.error = toAppError(cause);
      open.value = false;
    }
  } else
    draft.value = {
      name: '',
      directoryId: null,
      instructions: '',
      preferredProvider: null,
      preferredModel: '',
      defaultMode: null,
      pinned: false,
      archived: false,
    };
});
async function save() {
  busy.value = true;
  try {
    if (
      await projects.save({
        ...draft.value,
        ...(props.projectId ? { id: props.projectId } : {}),
      })
    )
      open.value = false;
  } finally {
    busy.value = false;
  }
}
async function choose() {
  const root = await projects.openDirectory();
  if (root) draft.value.directoryId = root.id;
}
</script>
<template>
  <Dialog v-model:open="open"
    ><DialogContent class="max-h-[85svh] overflow-auto sm:max-w-lg"
      ><DialogHeader
        ><DialogTitle>{{
          projectId ? 'Project settings' : 'Create project'
        }}</DialogTitle
        ><DialogDescription
          >Group conversations, instructions and a local directory. Deleting a
          project keeps its conversations.</DialogDescription
        ></DialogHeader
      >
      <form class="grid gap-4" @submit.prevent="save">
        <label class="grid gap-2 text-xs"
          >Project name<Input v-model="draft.name" maxlength="100" required
        /></label>
        <div class="grid gap-2">
          <label for="project-directory" class="text-xs">Directory</label
          ><NativeSelect
            id="project-directory"
            :model-value="draft.directoryId ?? ''"
            @update:model-value="draft.directoryId = $event || null"
            ><option value="">No directory</option>
            <option
              v-for="root in projects.directories"
              :key="root.id"
              :value="root.id"
            >
              {{ root.path }}{{ root.available ? '' : ' (missing)' }}
            </option></NativeSelect
          ><Button
            type="button"
            variant="outline"
            :disabled="projects.busy"
            @click="choose"
            >Choose directory…</Button
          >
        </div>
        <label class="grid gap-2 text-xs"
          >Project instructions<Textarea
            v-model="draft.instructions"
            class="min-h-28"
            maxlength="16000"
            placeholder="Conventions and context for work in this project"
        /></label>
        <label class="flex items-center gap-2 text-xs"
          ><input v-model="draft.pinned" type="checkbox" />Favorite
          project</label
        >
        <label class="flex items-center gap-2 text-xs"
          ><input v-model="draft.archived" type="checkbox" />Archive
          project</label
        >
        <label class="grid gap-2 text-xs"
          >Preferred provider<NativeSelect
            :model-value="draft.preferredProvider ?? ''"
            @update:model-value="
              draft.preferredProvider = $event
                ? ($event as Project['preferredProvider'])
                : null
            "
            ><option value="">Use the global provider</option>
            <option v-for="kind in connectionKinds" :key="kind" :value="kind">
              {{ connectionLabels[kind] }}
            </option></NativeSelect
          ></label
        >
        <label class="grid gap-2 text-xs"
          >Preferred model<Input
            v-model="draft.preferredModel"
            maxlength="256"
            placeholder="Use the global model"
        /></label>
        <label class="grid gap-2 text-xs"
          >Default mode<NativeSelect
            :model-value="draft.defaultMode ?? ''"
            @update:model-value="
              draft.defaultMode = $event ? ($event as AgentMode) : null
            "
            ><option value="">Use the global mode</option>
            <option v-for="mode in agentModes" :key="mode" :value="mode">
              {{ mode }}
            </option></NativeSelect
          ></label
        >
        <p v-if="projects.error" role="alert" class="text-xs text-destructive">
          {{ projects.error.message }}
        </p>
        <DialogFooter
          ><Button type="button" variant="outline" @click="open = false"
            >Cancel</Button
          ><Button type="submit" :disabled="busy || !draft.name.trim()"
            >Save project</Button
          ></DialogFooter
        >
      </form></DialogContent
    ></Dialog
  >
</template>
