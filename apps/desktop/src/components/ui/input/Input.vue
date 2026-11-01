<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { useVModel } from '@vueuse/core';
import { cn, definedProps } from '@/lib/utils';
import { controlField } from '../control-styles';

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes['class'];
}>();

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void;
}>();

const modelValue = useVModel(
  props,
  'modelValue',
  emits,
  definedProps({
    passive: true as const,
    defaultValue: props.defaultValue,
  }),
);
</script>

<template>
  <input
    v-model="modelValue"
    :class="
      cn(
        controlField,
        'flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        props.class,
      )
    "
  />
</template>
