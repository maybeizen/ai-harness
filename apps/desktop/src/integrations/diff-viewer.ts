import * as monaco from 'monaco-editor';
import type { ViewerPreferences } from './viewer';
function viewerOptions(preferences: ViewerPreferences) {
  return {
    tabSize: preferences.tabSize,
    wordWrap: preferences.wordWrap ? ('on' as const) : ('off' as const),
    minimap: { enabled: preferences.minimap },
  };
}
export function mountDiffViewer(
  container: HTMLElement,
  originalText: string,
  modifiedText: string,
  language: string,
  sideBySide: boolean,
  preferences: ViewerPreferences = {
    tabSize: 2,
    wordWrap: false,
    minimap: false,
  },
) {
  const original = monaco.editor.createModel(originalText, language);
  const modified = monaco.editor.createModel(modifiedText, language);
  const editor = monaco.editor.createDiffEditor(container, {
    readOnly: true,
    automaticLayout: true,
    renderSideBySide: sideBySide,
    scrollBeyondLastLine: false,
    fontSize: 13,
    theme:
      document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
    ...viewerOptions(preferences),
  });
  editor.setModel({ original, modified });
  const observer = new MutationObserver(() =>
    monaco.editor.setTheme(
      document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
    ),
  );
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return {
    layout: (next: boolean) => {
      editor.updateOptions({ renderSideBySide: next });
    },
    update: (before: string, after: string, lang: string) => {
      original.setValue(before);
      modified.setValue(after);
      monaco.editor.setModelLanguage(original, lang);
      monaco.editor.setModelLanguage(modified, lang);
    },
    apply: (next: ViewerPreferences) => {
      editor.updateOptions(viewerOptions(next));
    },
    dispose: () => {
      observer.disconnect();
      editor.dispose();
      original.dispose();
      modified.dispose();
    },
  };
}
