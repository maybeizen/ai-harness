<script setup lang="ts">
import type { SelectTriggerProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { ChevronDown } from '@lucide/vue';
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui';
import { cn, definedProps } from '@/lib/utils';
import { controlField } from '../control-styles';

const props = defineProps<
  SelectTriggerProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    v-bind="definedProps(forwardedProps)"
    :class="
      cn(
        controlField,
        'flex items-center justify-between text-start whitespace-nowrap data-[placeholder]:text-muted-foreground [&>span]:truncate',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="h-4 w-4 shrink-0 opacity-50" />
    </SelectIcon>
  </SelectTrigger>
</template>
