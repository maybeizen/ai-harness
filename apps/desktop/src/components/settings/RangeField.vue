<script setup lang="ts">
import { useId } from 'vue';
const props = withDefaults(
  defineProps<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
  }>(),
  { step: 1, suffix: '' },
);
const emit = defineEmits<{ change: [value: number] }>();
const id = useId();
</script>
<template>
  <div class="grid gap-1">
    <label :for="id" class="flex justify-between gap-3 text-xs font-medium"
      ><span>{{ label }}</span
      ><output :for="id" class="font-mono text-muted-foreground"
        >{{ Number(value.toFixed(2)) }}{{ suffix }}</output
      ></label
    >
    <input
      :id="id"
      type="range"
      class="setting-range"
      :min="min"
      :max="max"
      :step="props.step"
      :value="value"
      @input="emit('change', Number(($event.target as HTMLInputElement).value))"
    />
  </div>
</template>
