import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
export function mountEditor(container: HTMLElement) {
  const model = monaco.editor.createModel('', 'plaintext');
  const editor = monaco.editor.create(container, {
    model,
    automaticLayout: true,
  });
  return {
    dispose: () => {
      editor.dispose();
      model.dispose();
    },
  };
}
