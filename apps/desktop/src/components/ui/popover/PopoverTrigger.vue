<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { PopoverTriggerProps } from 'reka-ui';
import { PopoverTrigger } from 'reka-ui';

const props = defineProps<PopoverTriggerProps>();
</script>

<template>
  <PopoverTrigger v-bind="definedProps(props)">
    <slot />
  </PopoverTrigger>
</template>
