<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { SelectValueProps } from 'reka-ui';
import { SelectValue } from 'reka-ui';

const props = defineProps<SelectValueProps>();
</script>

<template>
  <SelectValue v-bind="definedProps(props)">
    <slot />
  </SelectValue>
</template>
