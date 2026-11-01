// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ColorField from './ColorField.vue';
it('keeps malformed color edits local and emits only validated values', async () => {
  const wrapper = mount(ColorField, {
    props: { label: 'Text', value: '#112233', fallback: '#FFFFFF' },
  });
  const field = wrapper.get('input[aria-label="Text hex value"]');
  await field.setValue('unsafe');
  await field.trigger('change');
  expect(wrapper.get('[role="alert"]').text()).toContain('Use a color');
  expect(field.attributes('aria-invalid')).toBe('true');
  expect(wrapper.emitted('change')).toBeUndefined();
  await field.setValue('#abcdef');
  await field.trigger('change');
  expect(wrapper.emitted('change')?.at(-1)).toEqual(['#abcdef']);
  await wrapper.get('input[type="checkbox"]').setValue(false);
  expect(wrapper.emitted('change')?.at(-1)).toEqual([null]);
  wrapper.unmount();
});
