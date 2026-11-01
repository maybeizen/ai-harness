import { expect, it } from 'vitest';
import { settingsSchema } from '@harness/contracts';
import {
  pushToTalkMatches,
  transcriptionPlan,
  voiceRefusalMessage,
} from './voice';
const voice = settingsSchema.parse({}).voice;
const keys = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  key: 'm',
};
it('refuses transcription until a local engine and microphone are available', () => {
  expect(transcriptionPlan(voice)).toMatchObject({ reason: 'engine-absent' });
  expect(voiceRefusalMessage('engine-absent')).toContain(
    'Nothing will be transcribed',
  );
  expect(
    transcriptionPlan({
      ...voice,
      engine: 'local-endpoint',
      localEndpoint: 'https://example.com/transcribe',
    }).reason,
  ).toBe('endpoint-not-local');
  expect(
    transcriptionPlan({
      ...voice,
      engine: 'local-command',
      localCommand: '',
    }).reason,
  ).toBe('command-missing');
  expect(
    transcriptionPlan({
      ...voice,
      microphone: 'denied',
      engine: 'local-command',
      localCommand: '/usr/bin/whisper',
    }).reason,
  ).toBe('microphone-denied');
  expect(
    transcriptionPlan({
      ...voice,
      engine: 'local-endpoint',
      localEndpoint: 'http://127.0.0.1:9/transcribe',
    }),
  ).toEqual({ ok: true, engine: 'local-endpoint' });
});
it('matches the stored push-to-talk shortcut', () => {
  expect(
    pushToTalkMatches(
      { ...keys, ctrlKey: true, shiftKey: true },
      voice.pushToTalk,
    ),
  ).toBe(true);
  expect(pushToTalkMatches({ ...keys, shiftKey: true }, voice.pushToTalk)).toBe(
    false,
  );
});
