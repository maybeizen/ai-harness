// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const created = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      created.options = options;
    }
    loadAddon() {}
    open() {}
    onData() {
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    focus() {}
    write() {}
    dispose() {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
import { mountInteractiveTerminal } from './interactive-terminal';
it('uses the font family and size without changing the terminal session callbacks', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const onInput = vi.fn();
  const onResize = vi.fn();
  const terminal = mountInteractiveTerminal(
    document.createElement('div'),
    onInput,
    onResize,
    { fontFamily: 'Georgia, serif', fontSize: 18, scrollback: 8000 },
  );
  expect(created.options).toMatchObject({
    fontFamily: 'Georgia, serif',
    fontSize: 18,
    scrollback: 8000,
  });
  terminal.applyFont('ui-monospace, monospace', 12);
  expect(created.options).toMatchObject({
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
  });
  expect(onInput).not.toHaveBeenCalled();
  terminal.dispose();
});
