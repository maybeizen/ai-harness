<script setup lang="ts">
import { watch } from 'vue';
import { ShieldCheck, Info } from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { useConnectionsStore } from '../../stores/connections';
import ConnectionCard from './ConnectionCard.vue';
const open = defineModel<boolean>({ required: true });
const connections = useConnectionsStore();
watch(open, (value) => {
  if (!value && connections.busy === 'chatgpt')
    void connections.cancelSignIn().catch(() => undefined);
});
</script>
<template>
  <Dialog v-model:open="open"
    ><DialogContent class="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader
        ><DialogTitle class="text-xl">Your AI connections</DialogTitle
        ><DialogDescription
          >Choose how you connect. Each connection discovers the models
          available to that account.</DialogDescription
        ></DialogHeader
      >
      <Alert v-if="connections.error" variant="destructive" role="alert"
        ><Info class="size-4" /><AlertDescription>{{
          connections.error.message
        }}</AlertDescription></Alert
      >
      <p
        v-if="connections.loading"
        role="status"
        class="text-sm text-muted-foreground"
      >
        Checking saved connections…
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <ConnectionCard
          v-for="connection in connections.records"
          :key="connection.id"
          :connection="connection"
          @connected="open = false"
        />
      </div>
      <p
        v-if="!connections.records.length && !connections.loading"
        class="text-sm text-muted-foreground"
      >
        The native runtime is unavailable. Restart the desktop app to configure
        providers.
      </p>
      <div
        class="flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground"
      >
        <ShieldCheck class="mt-0.5 size-3.5 shrink-0" />
        <p>
          App-owned credentials are saved through your OS credential service,
          unless you explicitly choose session-only use. Signing in or listing
          models does not guarantee quota; successful inference confirms access.
        </p>
      </div>
    </DialogContent></Dialog
  >
</template>
