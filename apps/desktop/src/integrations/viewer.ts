import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
export interface ViewerPreferences {
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
}
function viewerOptions(preferences: ViewerPreferences) {
  return {
    tabSize: preferences.tabSize,
    wordWrap: preferences.wordWrap ? ('on' as const) : ('off' as const),
    minimap: { enabled: preferences.minimap },
  };
}
export function mountViewer(
  container: HTMLElement,
  text: string,
  language: string,
  preferences: ViewerPreferences = {
    tabSize: 2,
    wordWrap: false,
    minimap: false,
  },
) {
  const model = monaco.editor.createModel(text, language);
  const editor = monaco.editor.create(container, {
    model,
    readOnly: true,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontSize: 13,
    theme:
      document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
    ...viewerOptions(preferences),
  });
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
    update: (value: string, lang: string) => {
      model.setValue(value);
      monaco.editor.setModelLanguage(model, lang);
    },
    apply: (next: ViewerPreferences) => {
      editor.updateOptions(viewerOptions(next));
    },
    dispose: () => {
      observer.disconnect();
      editor.dispose();
      model.dispose();
    },
  };
}
