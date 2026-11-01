<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { SelectItemTextProps } from 'reka-ui';
import { SelectItemText } from 'reka-ui';

const props = defineProps<SelectItemTextProps>();
</script>

<template>
  <SelectItemText v-bind="definedProps(props)">
    <slot />
  </SelectItemText>
</template>
