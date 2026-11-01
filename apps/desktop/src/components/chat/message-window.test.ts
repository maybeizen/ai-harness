import { expect, it } from 'vitest';
import { messageWindow, tailWindow } from './message-window';
it('keeps a long thread to the rows that fit the viewport', () => {
  const heights = Array.from({ length: 80 }, () => 100);
  const tail = tailWindow(80, 300, heights);
  expect(tail.end - tail.start).toBeLessThan(20);
  expect(tail.end).toBe(80);
  expect(tail.bottom).toBe(0);
  const top = messageWindow(80, 0, 300, heights);
  expect(top.start).toBe(0);
  expect(top.end).toBeLessThan(20);
});
