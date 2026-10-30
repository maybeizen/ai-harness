// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nativeBackend } from '../transport/backend';
import { useInfrastructureStore } from './infrastructure';
vi.mock('../transport/backend', () => {
  const nativeBackend = { health: vi.fn() };
  return { nativeBackend, useBackend: () => nativeBackend };
});
it('detects a later runtime failure and stops polling on disposal', async () => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.mocked(nativeBackend.health)
    .mockResolvedValueOnce({ status: 'ready', protocol: 2, storage: 'ready' })
    .mockRejectedValue(new Error('private diagnostic'));
  const store = useInfrastructureStore();
  try {
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.status).toBe('ready');
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.status).toBe('unavailable');
    expect(store.error).not.toContain('private diagnostic');
    store.stop();
    const count = vi.mocked(nativeBackend.health).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(nativeBackend.health).toHaveBeenCalledTimes(count);
  } finally {
    store.stop();
    vi.useRealTimers();
  }
});
