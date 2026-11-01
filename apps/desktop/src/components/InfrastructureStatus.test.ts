// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import InfrastructureStatus from './InfrastructureStatus.vue';
it('announces infrastructure failure without exposing exception details', () => {
  const wrapper = mount(InfrastructureStatus, {
    props: { status: 'unavailable', error: 'Runtime connection failed.' },
  });
  expect(wrapper.get('[role="status"]').text()).toContain('unavailable');
  expect(wrapper.text()).toContain('Runtime connection failed.');
  wrapper.unmount();
});
