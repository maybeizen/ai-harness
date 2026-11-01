// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { ref } from 'vue';
import { useComposerField } from './composer-field';
it('focuses the textarea inside the composer', () => {
  const root = document.createElement('div');
  const field = document.createElement('textarea');
  root.append(field);
  document.body.append(root);
  const composer = useComposerField(ref(root));
  composer.focus();
  expect(document.activeElement).toBe(field);
  root.remove();
});
