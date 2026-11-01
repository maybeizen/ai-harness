import { type Ref } from 'vue';
export function useComposerField(root: Ref<HTMLElement | null>) {
  function field() {
    return root.value?.querySelector('textarea') ?? null;
  }
  function resize() {
    const element = field();
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }
  function focus() {
    field()?.focus();
  }
  return { resize, focus };
}
