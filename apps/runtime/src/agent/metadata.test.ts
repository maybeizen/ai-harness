import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectMetadata } from './metadata';
it('reads manifest names and refuses symlinks and sensitive paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-meta-'));
  const outside = await mkdtemp(join(tmpdir(), 'agent-meta-out-'));
  try {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.2.3',
        scripts: { test: 'vitest run', leak: 'echo secret-token' },
      }),
    );
    const result = await projectMetadata(root, '');
    expect(result.manifests[0]).toMatchObject({
      path: 'package.json',
      fields: { name: 'fixture', version: '1.2.3', scripts: ['test', 'leak'] },
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(result.manifests[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    await symlink(join(root, 'package.json'), join(root, 'linked.json'));
    await expect(projectMetadata(root, 'linked.json')).rejects.toThrow('link');
    await symlink(outside, join(root, 'escape'));
    await expect(projectMetadata(root, 'escape')).rejects.toThrow('link');
    await expect(projectMetadata(root, '.env')).rejects.toThrow('protected');
    await mkdir(join(root, 'nested'));
    await writeFile(
      join(root, 'nested', 'Cargo.toml'),
      '[package]\nname = "nested"\nversion = "0.1.0"\n',
    );
    const nested = await projectMetadata(root, 'nested');
    expect(nested.manifests).toEqual([
      expect.objectContaining({
        path: 'nested/Cargo.toml',
        fields: { name: 'nested', version: '0.1.0' },
      }),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
