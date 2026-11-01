<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { useVModel } from '@vueuse/core';
import { cn, definedProps } from '@/lib/utils';
import { controlBase } from '../control-styles';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  defaultValue?: string | number;
  modelValue?: string | number;
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
  <textarea
    v-model="modelValue"
    :class="
      cn(
        controlBase,
        'flex min-h-[calc(var(--control-height)*2)] px-[var(--control-padding)] py-2',
        props.class,
      )
    "
  />
</template>
