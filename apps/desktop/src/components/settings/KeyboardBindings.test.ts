// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import KeyboardBindings from './KeyboardBindings.vue';
const mocks = vi.hoisted(() => ({ match: vi.fn(), toggle: vi.fn() }));
vi.mock('../../stores/shortcuts', () => ({
  useShortcutsStore: () => ({ match: mocks.match }),
}));
vi.mock('../ui/sidebar', () => ({
  useSidebar: () => ({ toggleSidebar: mocks.toggle }),
}));
it('dispatches context-aware bindings and releases its window listener', async () => {
  mocks.match.mockReset().mockReturnValue('newChat');
  mocks.toggle.mockReset();
  const wrapper = mount(KeyboardBindings);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.append(button);
  document.body.append(dialog);
  const event = () =>
    new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
  try {
    button.dispatchEvent(event());
    expect(mocks.match).not.toHaveBeenCalled();
    const ordinary = event();
    document.body.dispatchEvent(ordinary);
    expect(wrapper.emitted('action')?.[0]).toEqual(['newChat']);
    expect(ordinary.defaultPrevented).toBe(true);
    mocks.match.mockReturnValue('sidebar');
    document.body.dispatchEvent(event());
    expect(mocks.toggle).toHaveBeenCalledOnce();
    await wrapper.setProps({ disabled: true });
    const calls = mocks.match.mock.calls.length;
    document.body.dispatchEvent(event());
    expect(mocks.match).toHaveBeenCalledTimes(calls);
    wrapper.unmount();
    document.body.dispatchEvent(event());
    expect(mocks.match).toHaveBeenCalledTimes(calls);
  } finally {
    dialog.remove();
    if (wrapper.exists()) wrapper.unmount();
  }
});
