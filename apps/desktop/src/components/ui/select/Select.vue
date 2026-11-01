<script setup lang="ts">
import { definedProps } from '@/lib/utils';
import type { SelectRootEmits, SelectRootProps } from 'reka-ui';
import { SelectRoot, useForwardPropsEmits } from 'reka-ui';

const props = defineProps<SelectRootProps>();
const emits = defineEmits<SelectRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <SelectRoot v-bind="definedProps(forwarded)">
    <slot />
  </SelectRoot>
</template>
