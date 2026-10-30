<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { TooltipProviderProps } from 'reka-ui';
import { TooltipProvider } from 'reka-ui';

const props = defineProps<TooltipProviderProps>();
</script>

<template>
  <TooltipProvider v-bind="definedProps(props)">
    <slot />
  </TooltipProvider>
</template>
