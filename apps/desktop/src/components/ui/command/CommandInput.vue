<script setup lang="ts">
import type { ListboxFilterProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { Search } from '@lucide/vue';
import { ListboxFilter, useForwardProps } from 'reka-ui';
import { cn, definedProps } from '@/lib/utils';
import { useCommand } from '.';
import { controlBase } from '../control-styles';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ListboxFilterProps & {
    class?: HTMLAttributes['class'];
  }
>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);

const { filterState } = useCommand();
</script>

<template>
  <div class="flex items-center border-b px-3" cmdk-input-wrapper>
    <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <ListboxFilter
      v-bind="definedProps({ ...forwardedProps, ...$attrs })"
      v-model="filterState.search"
      auto-focus
      :class="
        cn(
          controlBase,
          'flex h-[var(--menu-search-height)] border-0 bg-transparent py-2 shadow-none focus-visible:ring-inset',
          props.class,
        )
      "
    />
  </div>
</template>
