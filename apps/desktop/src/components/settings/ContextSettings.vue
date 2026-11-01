<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  CONTEXT_RECORD_MAX_CHARS,
  UNTRUSTED_CONTEXT_NOTE,
  contextRecordSchema,
  toAppError,
  type ContextRecord,
} from '@harness/contracts';
import { z } from 'zod';
import { workstation } from '../../transport/workstation';
import { Button } from '../ui/button';
import { controlCheckbox, controlField } from '../ui/control-styles';
const props = defineProps<{ kind: 'rule' | 'skill' | 'prompt' }>();
const heading = { rule: 'Rules', skill: 'Skills', prompt: 'Prompts' }[
  props.kind
];
const records = ref<ContextRecord[]>([]);
const title = ref('');
const body = ref('');
const scope = ref<'global' | 'workspace'>('global');
const workspaceId = ref('');
const enabled = ref(true);
const error = ref('');
const listSchema = z.array(contextRecordSchema);
async function load() {
  try {
    records.value = listSchema.parse(
      await workstation({ action: 'context.list', kind: props.kind }),
    );
    error.value = '';
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
}
async function save() {
  const record = {
    id: crypto.randomUUID(),
    kind: props.kind,
    scope: scope.value,
    workspaceId: scope.value === 'workspace' ? workspaceId.value : null,
    title: title.value,
    body: body.value,
    enabled: enabled.value,
  };
  const parsed = contextRecordSchema.safeParse(record);
  if (!parsed.success) {
    error.value =
      'Use a title, a body within the context limit, and a workspace id only for workspace scope.';
    return;
  }
  try {
    await workstation({ action: 'context.save', record: parsed.data });
    title.value = '';
    body.value = '';
    await load();
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
}
async function remove(id: string) {
  try {
    await workstation({ action: 'context.remove', id });
    await load();
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
}
onMounted(() => {
  void load();
});
</script>
<template>
  <section
    class="setting-section"
    :aria-labelledby="`${kind}-settings-heading`"
  >
    <div>
      <h3 :id="`${kind}-settings-heading`" class="text-sm font-semibold">
        {{ heading }}
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        {{ UNTRUSTED_CONTEXT_NOTE }}
      </p>
    </div>
    <ul v-if="records.length" class="grid gap-2">
      <li
        v-for="record in records"
        :key="record.id"
        class="grid gap-1 rounded-md border p-3 text-xs"
      >
        <span class="font-medium">{{ record.title }}</span>
        <span class="text-muted-foreground"
          >{{ record.scope }} ·
          {{ record.enabled ? 'enabled' : 'disabled' }}</span
        >
        <p class="whitespace-pre-wrap">{{ record.body }}</p>
        <Button size="sm" variant="outline" @click="remove(record.id)"
          >Remove</Button
        >
      </li>
    </ul>
    <p v-else class="text-xs text-muted-foreground">No saved {{ kind }}s.</p>
    <label class="grid gap-2 text-xs font-medium"
      >Title<input v-model="title" :class="controlField" maxlength="80"
    /></label>
    <label class="grid gap-2 text-xs font-medium"
      >Body
      <textarea
        v-model="body"
        :class="controlField"
        class="min-h-24 py-2"
        :maxlength="CONTEXT_RECORD_MAX_CHARS"
      />
      <span class="font-normal text-muted-foreground"
        >{{ body.length }} / {{ CONTEXT_RECORD_MAX_CHARS }}</span
      ></label
    >
    <label class="grid gap-2 text-xs font-medium"
      >Scope<select v-model="scope" :class="controlField">
        <option value="global">Global</option>
        <option value="workspace">Workspace</option>
      </select></label
    >
    <label v-if="scope === 'workspace'" class="grid gap-2 text-xs font-medium"
      >Workspace id<input v-model="workspaceId" :class="controlField"
    /></label>
    <label class="flex items-center gap-3 text-sm"
      ><input
        v-model="enabled"
        type="checkbox"
        :class="controlCheckbox"
      />Enabled</label
    >
    <Button @click="save">Save {{ kind }}</Button>
    <p v-if="error" role="alert" class="text-xs text-destructive">
      {{ error }}
    </p>
  </section>
</template>
