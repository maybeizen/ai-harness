import { expect, it } from 'vitest';
import { shellProgram } from './process';
it('keeps bash as the default and rejects a relative shell', () => {
  expect(shellProgram('')).toBe('/bin/bash');
  expect(shellProgram('/bin/zsh')).toBe('/bin/zsh');
  expect(() => shellProgram('bash')).toThrow(/absolute path/);
  expect(() => shellProgram('/tmp/../bin/sh')).toThrow(/absolute path/);
});
