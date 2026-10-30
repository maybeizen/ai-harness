<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { TooltipTriggerProps } from 'reka-ui';
import { TooltipTrigger } from 'reka-ui';

const props = defineProps<TooltipTriggerProps>();
</script>

<template>
  <TooltipTrigger v-bind="definedProps(props)">
    <slot />
  </TooltipTrigger>
</template>
