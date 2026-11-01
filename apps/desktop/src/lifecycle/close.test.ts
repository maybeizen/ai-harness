import { it, expect, vi } from 'vitest';
import { closeBarrier } from './close';
it('coalesces close requests and never destroys before acknowledged writes', async () => {
  let release!: () => void;
  const write = new Promise<void>((resolve) => {
    release = resolve;
  });
  const destroy = vi.fn(() => Promise.resolve());
  const freeze = vi.fn();
  const close = closeBarrier({
    stop: () => Promise.resolve(),
    isActive: () => false,
    flush: () => write,
    freeze,
    destroy,
    report: vi.fn(),
  });
  const first = close();
  expect(close()).toBe(first);
  await Promise.resolve();
  expect(destroy).not.toHaveBeenCalled();
  expect(freeze).toHaveBeenCalledWith(true);
  release();
  await first;
  expect(destroy).toHaveBeenCalledTimes(1);
});
it('keeps the window open after storage or cancellation failure and permits retry', async () => {
  const destroy = vi.fn(() => Promise.resolve());
  const report = vi.fn();
  const freeze = vi.fn();
  const flush = vi
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockResolvedValue(undefined);
  const close = closeBarrier({
    stop: () => Promise.resolve(),
    isActive: () => false,
    flush,
    freeze,
    destroy,
    report,
  });
  await close();
  expect(destroy).not.toHaveBeenCalled();
  expect(freeze).toHaveBeenLastCalledWith(false);
  expect(report).toHaveBeenCalled();
  await close();
  expect(destroy).toHaveBeenCalledTimes(1);
});
