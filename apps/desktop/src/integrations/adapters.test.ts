// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  editorDispose: vi.fn(),
  modelDispose: vi.fn(),
  terminalDispose: vi.fn(),
  open: vi.fn(),
  fit: vi.fn(),
  loadAddon: vi.fn(),
}));
vi.mock('monaco-editor', () => ({
  editor: {
    create: () => ({ dispose: mocks.editorDispose }),
    createModel: () => ({ dispose: mocks.modelDispose }),
  },
}));
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: class {},
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    dispose = mocks.terminalDispose;
    open = mocks.open;
    loadAddon = mocks.loadAddon;
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = mocks.fit;
  },
}));
import { mountEditor } from './editor';
import { mountTerminal } from './terminal';
it('disposes editor and terminal resources', () => {
  const container = document.createElement('div');
  const editor = mountEditor(container);
  const terminal = mountTerminal(container);
  expect(mocks.open).toHaveBeenCalledWith(container);
  expect(mocks.fit).toHaveBeenCalledOnce();
  editor.dispose();
  terminal.dispose();
  expect(mocks.editorDispose).toHaveBeenCalledOnce();
  expect(mocks.modelDispose).toHaveBeenCalledOnce();
  expect(mocks.terminalDispose).toHaveBeenCalledOnce();
});
