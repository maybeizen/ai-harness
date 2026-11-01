<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { controlField } from './control-styles';
const props = defineProps<{ class?: HTMLAttributes['class'] }>();
const value = defineModel<string>({ required: true });
</script>
<template>
  <select v-model="value" :class="cn(controlField, props.class)">
    <slot />
  </select>
</template>
