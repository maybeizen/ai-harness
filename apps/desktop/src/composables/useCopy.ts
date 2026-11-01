import { onScopeDispose, ref } from 'vue';
import { useBackend } from '../transport/backend';
export function useCopy() {
  const backend = useBackend();
  const copied = ref(false);
  const failed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copy(text: string) {
    try {
      await backend.copy(text);
      copied.value = true;
      failed.value = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        copied.value = false;
      }, 2000);
    } catch {
      failed.value = true;
    }
  }
  onScopeDispose(() => clearTimeout(timer));
  return { copied, failed, copy };
}
