import { mountEditor } from '../src/integrations/editor';
import { mountTerminal } from '../src/integrations/terminal';
const editor = mountEditor(document.getElementById('editor')!);
const terminal = mountTerminal(document.getElementById('terminal')!);
document.getElementById('status')!.textContent = 'ready';
document.getElementById('dispose')!.addEventListener('click', () => {
  editor.dispose();
  terminal.dispose();
  document.getElementById('status')!.textContent = 'disposed';
});
