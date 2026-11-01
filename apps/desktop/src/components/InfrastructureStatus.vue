<script setup lang="ts">
import { Badge } from './ui/badge';
defineProps<{ status: string; error: string | null }>();
</script>
<template>
  <section
    aria-label="Infrastructure"
    class="rounded-lg border border-border p-5"
    role="status"
  >
    <p>
      Runtime: <Badge>{{ status }}</Badge>
    </p>
    <p v-if="error" class="mt-2 text-red-300">{{ error }}</p>
  </section>
</template>
