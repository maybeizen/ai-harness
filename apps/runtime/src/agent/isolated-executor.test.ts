import { it, expect } from 'vitest';
import { createServer } from 'node:net';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LinuxExecutor } from './isolated-executor';
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const node = (code: string) => `node -e ${quote(code)}`;
it('runs real namespace isolation with empty HOME/environment, masked secrets and ordinary workspace writes', async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'axioden-isolation-')),
  );
  const outside = await mkdtemp(join(tmpdir(), 'axioden-host-secret-'));
  const executor = new LinuxExecutor();
  const original = process.env['AXIODEN_TEST_TOKEN'];
  process.env['AXIODEN_TEST_TOKEN'] = 'ambient-token-must-not-leak';
  try {
    await writeFile(
      join(outside, 'private-key'),
      'host-private-key-must-not-leak',
    );
    await writeFile(join(root, '.env'), 'existing-workspace-key-must-not-leak');
    await mkdir(join(root, '.ssh'));
    await writeFile(join(root, '.ssh', 'id_ed25519'), 'ssh-key-must-not-leak');
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'config'), 'git-config-must-not-leak');
    const code = `const fs=require('node:fs'); if(process.env.AXIODEN_TEST_TOKEN)throw Error('environment leaked');if(require('node:child_process').spawnSync('unshare',['-Ur','true']).status===0)throw Error('nested namespaces available');if(fs.existsSync(${JSON.stringify(join(outside, 'private-key'))}))throw Error('host file visible');try{if(fs.readFileSync('.env','utf8'))throw Error('workspace env leaked');}catch(error){if(error.message==='workspace env leaked')throw error;if(!['EACCES','EPERM','EROFS'].includes(error.code))throw error;}try{fs.writeFileSync('.env','overwrite');throw Error('protected write allowed');}catch(error){if(error.message==='protected write allowed')throw error;}if(fs.existsSync('.ssh/id_ed25519')||fs.existsSync('.git/config'))throw Error('protected directory leaked');for(const processId of ['self','1']){for(const fd of fs.readdirSync('/proc/'+processId+'/fd')){try{if(fs.readFileSync('/proc/'+processId+'/fd/'+fd+'/.env','utf8'))throw Error('source fd leaked');}catch(error){if(error.message==='source fd leaked')throw error;}}}fs.writeFileSync('ordinary.txt','approved command write');console.log('isolated:'+process.env.HOME);`;
    const result = (await executor.execute(
      { root, command: node(code), timeoutMs: 5000 },
      new AbortController().signal,
    )) as { stdout: string; exitCode: number };
    expect(result.stdout).toContain('isolated:/home/agent');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('must-not-leak');
    expect(await readFile(join(root, 'ordinary.txt'), 'utf8')).toBe(
      'approved command write',
    );
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(
      'existing-workspace-key-must-not-leak',
    );
  } finally {
    if (original === undefined) delete process.env['AXIODEN_TEST_TOKEN'];
    else process.env['AXIODEN_TEST_TOKEN'] = original;
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
it('cannot connect to a host loopback service from the private network namespace', async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'axioden-network-')),
  );
  const server = createServer((socket) => socket.end('host-only'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  try {
    const code = `const socket=require('node:net').connect({host:'127.0.0.1',port:${address.port}});socket.on('connect',()=>{console.error('host network leaked');process.exit(4)});socket.on('error',()=>console.log('network isolated'));`;
    const result = (await new LinuxExecutor().execute(
      { root, command: node(code), timeoutMs: 4000 },
      new AbortController().signal,
    )) as { stdout: string };
    expect(result.stdout).toContain('network isolated');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
it('bounds output and execution time and kills a descendant namespace on cancellation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'axioden-cancel-')));
  const executor = new LinuxExecutor();
  try {
    await expect(
      executor.execute(
        {
          root,
          command: node("process.stdout.write('x'.repeat(200000))"),
          timeoutMs: 4000,
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('128 KiB');
    await expect(
      executor.execute(
        { root, command: node('setInterval(()=>{},1000)'), timeoutMs: 100 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('time limit');
    const controller = new AbortController();
    const running = executor.execute(
      {
        root,
        command: node(
          "const {spawn}=require('node:child_process');spawn('node',['-e',`setInterval(()=>require('node:fs').appendFileSync('heartbeat','x'),20)`],{stdio:'ignore'});require('node:fs').writeFileSync('ready','yes');setInterval(()=>{},1000)",
        ),
        timeoutMs: 5000,
      },
      controller.signal,
    );
    const { vi } = await import('vitest');
    await vi.waitFor(async () =>
      expect(await readFile(join(root, 'ready'), 'utf8')).toBe('yes'),
    );
    controller.abort();
    await expect(running).rejects.toThrow('cancelled');
    const before = await readFile(join(root, 'heartbeat'), 'utf8').catch(
      () => '',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await readFile(join(root, 'heartbeat'), 'utf8').catch(
      () => '',
    );
    expect(after).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('fails closed when bubblewrap is missing and rejects invalid command limits', async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'axioden-no-isolation-')),
  );
  try {
    await expect(
      new LinuxExecutor('/missing/bwrap').execute(
        { root, command: 'echo must-not-run', timeoutMs: 1000 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('No host-shell fallback');
    await expect(
      new LinuxExecutor().execute(
        { root, command: 'echo no', timeoutMs: 0 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Invalid isolated');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
