<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { DialogTriggerProps } from 'reka-ui';
import { DialogTrigger } from 'reka-ui';

const props = defineProps<DialogTriggerProps>();
</script>

<template>
  <DialogTrigger v-bind="definedProps(props)">
    <slot />
  </DialogTrigger>
</template>
