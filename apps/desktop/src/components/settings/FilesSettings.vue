<script setup lang="ts">
import { ref } from 'vue';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentMediaTypes,
  retentionApplyResultSchema,
  retentionPreviewSchema,
  toAppError,
} from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { workstation } from '../../transport/workstation';
import { Button } from '../ui/button';
import { controlCheckbox, controlField } from '../ui/control-styles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
const preferences = useSettingsStore();
const message = ref('');
const error = ref('');
const confirm = ref(false);
const pending = ref<string[]>([]);
const busy = ref(false);
function patch(update: Partial<typeof preferences.settings.retention>) {
  void preferences.patch({
    retention: { ...preferences.settings.retention, ...update },
  });
}
function optionalNumber(value: string) {
  return value === '' ? null : Number(value);
}
async function preview() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await preferences.patch({ retention: preferences.settings.retention });
    pending.value = retentionPreviewSchema.parse(
      await workstation({
        action: 'retention.preview',
        activeConversationId: preferences.settings.activeConversation,
      }),
    ).ids;
    if (pending.value.length) confirm.value = true;
    else message.value = 'No conversations match this retention policy.';
  } catch (cause) {
    error.value = toAppError(cause).message;
  } finally {
    busy.value = false;
  }
}
async function apply() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = retentionApplyResultSchema.parse(
      await workstation({
        action: 'retention.apply',
        confirmed: true,
        activeConversationId: preferences.settings.activeConversation,
      }),
    );
    message.value = `Deleted ${result.deleted.length} conversations. The active conversation was kept.`;
    confirm.value = false;
    pending.value = [];
  } catch (cause) {
    error.value = toAppError(cause).message;
    confirm.value = false;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="setting-section" aria-labelledby="files-settings-heading">
    <div>
      <h3 id="files-settings-heading" class="text-sm font-semibold">Files</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Attachments are limited to {{ ATTACHMENT_MAX_BYTES }} bytes and
        {{ attachmentMediaTypes.join(', ') }}. A message can reference up to 8
        attachments.
      </p>
    </div>
    <label class="flex items-center gap-3 text-sm"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="preferences.settings.retention.enabled"
        @change="
          patch({ enabled: ($event.target as HTMLInputElement).checked })
        "
      />Enable retention</label
    >
    <div class="setting-grid">
      <label class="grid gap-2 text-xs font-medium"
        >Maximum age in days<input
          :class="controlField"
          type="number"
          min="1"
          max="3650"
          :value="preferences.settings.retention.maxAgeDays ?? ''"
          @change="
            patch({
              maxAgeDays: optionalNumber(
                ($event.target as HTMLInputElement).value,
              ),
            })
          "
      /></label>
      <label class="grid gap-2 text-xs font-medium"
        >Maximum conversations<input
          :class="controlField"
          type="number"
          min="1"
          max="10000"
          :value="preferences.settings.retention.maxConversations ?? ''"
          @change="
            patch({
              maxConversations: optionalNumber(
                ($event.target as HTMLInputElement).value,
              ),
            })
          "
      /></label>
    </div>
    <p class="text-xs leading-5 text-muted-foreground">
      Deletion always requires confirmation and never removes the active
      conversation. Each confirmed pass deletes at most 500 matching
      conversations.
    </p>
    <Button variant="outline" :disabled="busy" @click="preview"
      >Review deletions</Button
    >
    <p v-if="message" class="text-xs text-muted-foreground">{{ message }}</p>
    <p v-if="error" role="alert" class="text-xs text-destructive">
      {{ error }}
    </p>
    <Dialog :open="confirm" @update:open="confirm = $event"
      ><DialogContent class="sm:max-w-md"
        ><DialogHeader
          ><DialogTitle>Delete {{ pending.length }} conversations?</DialogTitle
          ><DialogDescription
            >This removes conversations that match the saved retention policy.
            The active conversation stays. This cannot be undone from this
            screen.</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="confirm = false">Cancel</Button
          ><Button variant="destructive" :disabled="busy" @click="apply"
            >Delete conversations</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </section>
</template>
