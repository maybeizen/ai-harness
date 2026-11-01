<script setup lang="ts">
import { ref, watch, useId } from 'vue';
import { Input } from '../ui/input';
import { controlCheckbox } from '../ui/control-styles';
const props = defineProps<{
  label: string;
  value: string | null;
  fallback: string;
}>();
const emit = defineEmits<{ change: [value: string | null] }>();
const id = useId();
const draft = ref(props.value ?? props.fallback);
const error = ref('');
watch(
  () => props.value,
  (value) => {
    draft.value = value ?? props.fallback;
    error.value = '';
  },
);
function commit(event?: Event) {
  const target = event?.target as HTMLInputElement | undefined;
  if (target) draft.value = target.value;
  if (!/^#[\da-f]{6}$/i.test(draft.value)) {
    error.value = 'Use a color such as #17212B.';
    return;
  }
  error.value = '';
  emit('change', draft.value);
}
</script>
<template>
  <div class="grid gap-2">
    <label class="flex items-center gap-2 text-xs font-medium"
      ><input
        type="checkbox"
        :class="controlCheckbox"
        :checked="value !== null"
        @change="
          emit(
            'change',
            ($event.target as HTMLInputElement).checked ? fallback : null,
          )
        "
      />{{ label }}</label
    >
    <div class="flex items-center gap-2">
      <input
        type="color"
        :aria-label="`${label} picker`"
        :value="value ?? fallback"
        :disabled="value === null"
        class="h-[var(--control-height)] w-10 shrink-0 rounded border border-input bg-background p-1 disabled:opacity-50"
        @input="emit('change', ($event.target as HTMLInputElement).value)"
      />
      <Input
        :id="id"
        v-model="draft"
        :aria-label="`${label} hex value`"
        :disabled="value === null"
        :aria-invalid="!!error"
        :aria-describedby="error ? `${id}-error` : undefined"
        maxlength="7"
        spellcheck="false"
        @change="commit"
        @keydown.enter.prevent="commit"
      />
    </div>
    <p
      v-if="error"
      :id="`${id}-error`"
      role="alert"
      class="text-xs text-destructive"
    >
      {{ error }}
    </p>
  </div>
</template>
