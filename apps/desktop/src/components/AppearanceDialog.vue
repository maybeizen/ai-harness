<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import AppearanceSettings from './settings/AppearanceSettings.vue';
const open = defineModel<boolean>({ required: true });
</script>
<template>
  <Dialog v-model:open="open"
    ><DialogContent
      class="flex max-h-[88svh] flex-col overflow-hidden sm:max-w-2xl"
      ><DialogHeader
        ><DialogTitle>Appearance</DialogTitle
        ><DialogDescription
          >Customize your workstation. Changes preview live and save on this
          device.</DialogDescription
        ></DialogHeader
      ><AppearanceSettings /></DialogContent
  ></Dialog>
</template>
