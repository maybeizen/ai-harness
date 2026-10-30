import {
  query,
  type Options,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute } from 'node:path';
import type { ChatModel, TextMessage } from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
const exec = promisify(execFile);
export function claudeOptions(
  executable: string,
  directory: string,
  controller: AbortController,
): Options {
  const env: Record<string, string | undefined> = {};
  for (const name of [
    'PATH',
    'HOME',
    'USER',
    'XDG_CONFIG_HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ])
    env[name] = process.env[name];
  env['CLAUDE_AGENT_SDK_CLIENT_APP'] = 'ai-harness/0.1.0';
  return {
    pathToClaudeCodeExecutable: executable,
    cwd: directory,
    abortController: controller,
    env,
    stderr: () => {},
    tools: [],
    disallowedTools: ['*'],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    skills: [],
    plugins: [],
    hooks: {},
    agents: {},
    persistSession: false,
    includePartialMessages: true,
    permissionMode: 'default',
    maxTurns: 1,
    extraArgs: { 'safe-mode': null },
    systemPrompt:
      'You are a helpful personal chat assistant. Answer the final user message using the role-labelled conversation supplied as context. You have no tools.',
  };
}
async function verify(executable: string, signal: AbortSignal) {
  if (!isAbsolute(executable))
    throw new ProviderFailure({
      code: 'CLIENT_REQUIRED',
      message:
        'Choose the absolute path to an installed official Claude client, then sign in with claude auth login.',
    });
  try {
    const { stdout } = await exec(executable, ['--version'], {
      signal,
      timeout: 10000,
      maxBuffer: 16384,
    });
    if (!stdout.includes('Claude Code')) throw new Error('Invalid client');
  } catch {
    throw new ProviderFailure({
      code: 'CLIENT_REQUIRED',
      message:
        'The official Claude client could not start. Check its path and update it to the current stable release.',
    });
  }
}
export async function claudeModels(
  executable: string,
  directory: string,
): Promise<ChatModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    await verify(executable, controller.signal);
  } catch (error) {
    clearTimeout(timer);
    controller.abort();
    throw error;
  }
  const idle: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          if (controller.signal.aborted)
            resolve({ done: true, value: undefined });
          else
            controller.signal.addEventListener(
              'abort',
              () => resolve({ done: true, value: undefined }),
              { once: true },
            );
        }),
    }),
  };
  const session = query({
    prompt: idle,
    options: claudeOptions(executable, directory, controller),
  });
  try {
    const account = await session.accountInfo();
    if (
      !account.subscriptionType ||
      (account.apiProvider && account.apiProvider !== 'firstParty') ||
      (account.apiKeySource && account.apiKeySource !== 'none')
    )
      throw new ProviderFailure({
        code: 'AUTH_REQUIRED',
        message:
          'Sign in to the official Claude client with your Claude plan. API-key billing is a separate connection.',
      });
    return (await session.supportedModels()).map((model) => ({
      id: model.value,
      name: model.displayName,
      verified: false,
      available: true,
    }));
  } finally {
    clearTimeout(timer);
    controller.abort();
    session.close();
  }
}
export async function* claudeStream(
  executable: string,
  directory: string,
  modelId: string,
  messages: TextMessage[],
  controller: AbortController,
): AsyncGenerator<string> {
  const session = query({
    prompt: JSON.stringify({
      conversation: messages.map(({ role, text }) => ({ role, text })),
    }),
    options: {
      ...claudeOptions(executable, directory, controller),
      model: modelId,
    },
  });
  let completed = false;
  try {
    for await (const message of session) {
      if (
        message.type === 'stream_event' &&
        message.event.type === 'content_block_delta' &&
        message.event.delta.type === 'text_delta'
      )
        yield message.event.delta.text;
      if (message.type === 'result') {
        if (message.is_error || message.subtype !== 'success')
          throw new ProviderFailure({
            code: 'UNAVAILABLE',
            message:
              'Claude could not complete this reply. Check your subscription usage and official client sign-in.',
          });
        completed = true;
      }
    }
    if (!completed && !controller.signal.aborted)
      throw new Error('Claude stream interrupted');
  } finally {
    session.close();
  }
}
