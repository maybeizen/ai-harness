// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const created = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
}));
vi.mock('monaco-editor', () => ({
  editor: {
    createDiffEditor: (
      _container: unknown,
      options: Record<string, unknown>,
    ) => {
      created.options = options;
      return {
        dispose: vi.fn(),
        setModel: vi.fn(),
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
import { mountDiffViewer } from './diff-viewer';
it('opens a Monaco diff editor in split or unified layout', () => {
  const viewer = mountDiffViewer(
    document.createElement('div'),
    'before',
    'after',
    'typescript',
    true,
    { tabSize: 4, wordWrap: true, minimap: true },
  );
  expect(created.options).toMatchObject({
    renderSideBySide: true,
    readOnly: true,
    tabSize: 4,
    wordWrap: 'on',
    minimap: { enabled: true },
  });
  viewer.layout(false);
  expect(created.updated).toMatchObject({ renderSideBySide: false });
  viewer.apply({ tabSize: 2, wordWrap: false, minimap: false });
  expect(created.updated).toEqual({
    tabSize: 2,
    wordWrap: 'off',
    minimap: { enabled: false },
  });
  viewer.dispose();
});
