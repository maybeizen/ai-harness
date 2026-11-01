import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useBackend } from '../transport/backend';
export const useInfrastructureStore = defineStore('infrastructure', () => {
  const backend = useBackend();
  const status = ref('starting');
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  async function connect() {
    try {
      const health = await backend.health();
      status.value = health.status;
      error.value = null;
    } catch {
      status.value = 'unavailable';
      error.value =
        'Runtime connection failed. See application logs for diagnostics.';
    }
  }
  function start() {
    if (!stopped) return;
    stopped = false;
    async function poll() {
      await connect();
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 5000);
    }
    void poll();
  }
  function stop() {
    stopped = true;
    clearTimeout(timer);
  }
  return { status, error, connect, start, stop };
});
