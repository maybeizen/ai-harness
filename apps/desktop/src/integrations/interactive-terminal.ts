import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
export function mountInteractiveTerminal(
  container: HTMLElement,
  onInput: (data: string) => void,
  onResize: (cols: number, rows: number) => void,
  font: { fontFamily: string; fontSize: number; scrollback: number } = {
    fontFamily: 'ui-monospace,monospace',
    fontSize: 13,
    scrollback: 3000,
  },
) {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: font.fontSize,
    fontFamily: font.fontFamily,
    scrollback: font.scrollback,
    theme: { background: '#101318', foreground: '#e6e9ee' },
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  fit.fit();
  const input = terminal.onData(onInput);
  const resize = terminal.onResize((value) => onResize(value.cols, value.rows));
  const observer = new ResizeObserver(() => {
    if (container.clientWidth && container.clientHeight) fit.fit();
  });
  observer.observe(container);
  onResize(terminal.cols, terminal.rows);
  terminal.focus();
  return {
    write: (data: string) => terminal.write(data),
    applyFont: (fontFamily: string, fontSize: number) => {
      terminal.options.fontFamily = fontFamily;
      terminal.options.fontSize = fontSize;
      fit.fit();
    },
    dispose: () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      terminal.dispose();
    },
  };
}
