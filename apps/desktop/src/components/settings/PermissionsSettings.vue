<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  auditPageSchema,
  type AuditRow,
  type PermissionPolicy,
} from '@harness/contracts';
import { toAppError } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { workstation } from '../../transport/workstation';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
const preferences = useSettingsStore();
const rows = ref<AuditRow[]>([]);
const error = ref('');
const confirmFull = ref(false);
const policies: { id: PermissionPolicy; label: string; detail: string }[] = [
  {
    id: 'manual',
    label: 'Manual',
    detail: 'Sensitive effects wait for a decision.',
  },
  {
    id: 'automatic',
    label: 'Automatic',
    detail: 'Configured safe operations can proceed. Other effects still wait.',
  },
  {
    id: 'full',
    label: 'Full',
    detail:
      'Workspace edits and permitted commands skip individual approvals. Protected paths stay blocked.',
  },
];
function choose(policy: PermissionPolicy) {
  if (policy === 'full' && preferences.settings.permissionPolicy !== 'full')
    confirmFull.value = true;
  else void preferences.patch({ permissionPolicy: policy });
}
onMounted(async () => {
  try {
    rows.value = auditPageSchema.parse(
      await workstation({ action: 'audit', limit: 50, before: null }),
    ).rows;
  } catch (cause) {
    error.value = toAppError(cause).message;
  }
});
</script>
<template>
  <section
    class="setting-section"
    aria-labelledby="permissions-settings-heading"
  >
    <div>
      <h3 id="permissions-settings-heading" class="text-sm font-semibold">
        Permissions
      </h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        This policy is stored with the rest of your settings.
      </p>
    </div>
    <div class="grid gap-2">
      <label
        v-for="policy in policies"
        :key="policy.id"
        class="flex items-start gap-3 text-sm"
        ><input
          type="radio"
          name="permission-policy"
          :checked="preferences.settings.permissionPolicy === policy.id"
          @change="choose(policy.id)"
        /><span
          ><span class="font-medium">{{ policy.label }}</span
          ><span class="mt-1 block text-xs text-muted-foreground">{{
            policy.detail
          }}</span></span
        ></label
      >
    </div>
    <div>
      <h4 class="text-sm font-medium">Audit history</h4>
      <p v-if="error" role="alert" class="mt-2 text-xs text-destructive">
        {{ error }}
      </p>
      <p v-else-if="!rows.length" class="mt-2 text-xs text-muted-foreground">
        No audit records yet.
      </p>
      <ul v-else class="mt-2 grid gap-2">
        <li v-for="row in rows" :key="row.id" class="text-xs leading-5">
          <span class="font-medium">{{ row.tool }}</span>
          {{ row.status }}
          <span v-if="row.code">{{ row.code }}</span>
          <time class="block text-muted-foreground">{{
            new Date(row.at).toLocaleString()
          }}</time>
        </li>
      </ul>
    </div>
    <Dialog :open="confirmFull" @update:open="confirmFull = $event"
      ><DialogContent class="sm:max-w-md"
        ><DialogHeader
          ><DialogTitle>Enable full access?</DialogTitle
          ><DialogDescription
            >Agent tasks may edit files and run permitted commands within the
            selected workspace without individual approvals. Protected paths
            remain blocked.</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="confirmFull = false"
            >Keep current policy</Button
          ><Button
            @click="
              preferences.patch({ permissionPolicy: 'full' });
              confirmFull = false;
            "
            >Enable full access</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </section>
</template>
