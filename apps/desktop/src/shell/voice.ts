import type { VoicePreferences } from '@harness/contracts';
export type VoiceRefusal =
  | 'engine-absent'
  | 'command-missing'
  | 'endpoint-missing'
  | 'endpoint-not-local'
  | 'microphone-denied';
const reasons: Record<VoiceRefusal, string> = {
  'engine-absent':
    'Transcription is off because no local engine is configured. Nothing will be transcribed.',
  'command-missing': 'The local command is empty. Nothing will be transcribed.',
  'endpoint-missing':
    'The local endpoint is empty. Nothing will be transcribed.',
  'endpoint-not-local':
    'Transcription accepts only an HTTP or HTTPS endpoint on this computer, without credentials. Nothing will be transcribed.',
  'microphone-denied':
    'Microphone permission is denied. Nothing will be transcribed.',
};
export function voiceRefusalMessage(reason: VoiceRefusal) {
  return reasons[reason];
}
export function localVoiceEndpoint(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
export function transcriptionPlan(voice: VoicePreferences) {
  if (voice.microphone === 'denied')
    return { ok: false as const, reason: 'microphone-denied' as const };
  if (voice.engine === 'unconfigured')
    return { ok: false as const, reason: 'engine-absent' as const };
  if (voice.engine === 'local-command') {
    if (!voice.localCommand.trim())
      return { ok: false as const, reason: 'command-missing' as const };
    return { ok: true as const, engine: voice.engine };
  }
  if (!voice.localEndpoint.trim())
    return { ok: false as const, reason: 'endpoint-missing' as const };
  if (!localVoiceEndpoint(voice.localEndpoint))
    return { ok: false as const, reason: 'endpoint-not-local' as const };
  return { ok: true as const, engine: voice.engine };
}
export function pushToTalkMatches(
  event: {
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    key: string;
  },
  shortcut: string,
) {
  const parts = shortcut.split('+').filter(Boolean);
  const key = parts.at(-1) ?? '';
  const modifiers = new Set(parts.slice(0, -1));
  const ctrlOrMeta = modifiers.has('CtrlOrMeta');
  if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return false;
  if (!ctrlOrMeta && modifiers.has('Ctrl') !== event.ctrlKey) return false;
  if (!ctrlOrMeta && modifiers.has('Meta') !== event.metaKey) return false;
  if (modifiers.has('Shift') !== event.shiftKey) return false;
  if (modifiers.has('Alt') !== event.altKey) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}
