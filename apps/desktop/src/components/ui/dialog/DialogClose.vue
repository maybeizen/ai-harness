<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { DialogCloseProps } from 'reka-ui';
import { DialogClose } from 'reka-ui';

const props = defineProps<DialogCloseProps>();
</script>

<template>
  <DialogClose v-bind="definedProps(props)">
    <slot />
  </DialogClose>
</template>
