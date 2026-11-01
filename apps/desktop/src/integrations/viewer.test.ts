// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const created = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
}));
vi.mock('monaco-editor', () => ({
  editor: {
    create: (_container: unknown, options: Record<string, unknown>) => {
      created.options = options;
      return {
        dispose: vi.fn(),
        updateOptions: (next: Record<string, unknown>) => {
          created.updated = next;
        },
      };
    },
    createModel: () => ({ dispose: vi.fn(), setValue: vi.fn() }),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
  },
}));
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: class {},
}));
import { mountViewer } from './viewer';
it('applies tab size, word wrap, and the minimap to the Monaco viewer', () => {
  const viewer = mountViewer(
    document.createElement('div'),
    'const ready = true',
    'typescript',
    {
      tabSize: 4,
      wordWrap: true,
      minimap: true,
    },
  );
  expect(created.options).toMatchObject({
    tabSize: 4,
    wordWrap: 'on',
    minimap: { enabled: true },
    readOnly: true,
  });
  viewer.apply({ tabSize: 2, wordWrap: false, minimap: false });
  expect(created.updated).toEqual({
    tabSize: 2,
    wordWrap: 'off',
    minimap: { enabled: false },
  });
  viewer.dispose();
});
