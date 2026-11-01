import type { ConnectionKind } from '@harness/contracts';
export const connectionInfo: Record<
  ConnectionKind,
  { description: string; setup: string; action: string; endpoint?: string }
> = {
  chatgpt: {
    description:
      'Use eligible ChatGPT plan usage through official browser sign-in. No API key needed.',
    setup: 'https://developers.openai.com/siwc/token-sharing-open-source',
    action: 'Continue with ChatGPT',
  },
  openai: {
    description:
      'Connect an OpenAI Platform key. API usage is billed separately from your ChatGPT subscription.',
    setup: 'https://platform.openai.com/api-keys',
    action: 'Connect API key',
  },
  'claude-client': {
    description:
      'Use an existing sign-in in the official Claude client. This app never reads or copies its tokens.',
    setup: 'https://code.claude.com/docs/en/quickstart',
    action: 'Connect official client',
  },
  anthropic: {
    description:
      'Connect a Claude Console key. API quotas and billing apply; eligible plan credits may cover API usage.',
    setup: 'https://platform.claude.com/settings/keys',
    action: 'Connect API key',
  },
  google: {
    description:
      'Connect a Google AI Studio key. Gemini API quotas and billing apply independently of Google AI subscriptions.',
    setup: 'https://aistudio.google.com/apikey',
    action: 'Connect API key',
  },
  xai: {
    description:
      'Connect an xAI Console key. API access and billing are separate from Grok consumer sign-in.',
    setup: 'https://console.x.ai',
    action: 'Connect API key',
  },
  openrouter: {
    description:
      'Connect an OpenRouter key. Discovery and chat use the official OpenRouter endpoint.',
    setup: 'https://openrouter.ai/keys',
    action: 'Connect API key',
  },
  ollama: {
    description:
      'Connect a local Ollama server. The default base URL is http://127.0.0.1:11434/v1. A bearer token is optional.',
    setup: 'https://ollama.com/',
    action: 'Connect Ollama',
    endpoint: 'http://127.0.0.1:11434/v1',
  },
  lmstudio: {
    description:
      'Connect a local LM Studio server. The default base URL is http://127.0.0.1:1234/v1. A bearer token is optional.',
    setup: 'https://lmstudio.ai/',
    action: 'Connect LM Studio',
    endpoint: 'http://127.0.0.1:1234/v1',
  },
  custom: {
    description:
      'Connect an OpenAI-compatible endpoint. The base URL must be HTTP or HTTPS and cannot contain credentials.',
    setup: '',
    action: 'Connect endpoint',
    endpoint: 'https://host.example/v1',
  },
};
