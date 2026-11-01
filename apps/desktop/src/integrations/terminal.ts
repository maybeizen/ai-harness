import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
export function mountTerminal(container: HTMLElement) {
  const terminal = new Terminal();
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  fit.fit();
  return { dispose: () => terminal.dispose() };
}
