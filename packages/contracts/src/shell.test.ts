import { describe, expect, it } from 'vitest';
import { settingsSchema } from './preferences';
import {
  editorPreferencesSchema,
  terminalPreferencesSchema,
  voicePreferencesSchema,
  windowGeometrySchema,
} from './shell';
describe('shell preferences', () => {
  it('applies defaults for saved settings that predate the shell fields', () => {
    const settings = settingsSchema.parse({ theme: 'light' });
    expect(settings.theme).toBe('light');
    expect(settings.fontFamily).toBe('system');
    expect(settings.window).toBeNull();
    expect(settings.terminal).toEqual(terminalPreferencesSchema.parse({}));
    expect(settings.editor).toEqual({
      tabSize: 2,
      wordWrap: false,
      minimap: false,
    });
    expect(settings.notifications.doNotDisturb).toBe(false);
    expect(settings.voice.engine).toBe('unconfigured');
    expect(settings.sidebarGroups).toEqual({
      projects: true,
      directories: true,
      conversations: true,
    });
  });
  it('rejects values outside the allowlists', () => {
    expect(settingsSchema.safeParse({ fontFamily: 'Comic Sans' }).success).toBe(
      false,
    );
    expect(
      windowGeometrySchema.safeParse({ x: 0, y: 0, width: 100, height: 800 })
        .success,
    ).toBe(false);
    expect(
      windowGeometrySchema.safeParse({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        maximized: false,
        display: 2,
      }).success,
    ).toBe(false);
    expect(
      terminalPreferencesSchema.safeParse({ shell: 'zsh;rm' }).success,
    ).toBe(false);
    expect(editorPreferencesSchema.safeParse({ tabSize: 0 }).success).toBe(
      false,
    );
    expect(
      voicePreferencesSchema.safeParse({
        localEndpoint: 'http://user:pass@127.0.0.1/transcribe',
      }).success,
    ).toBe(false);
    expect(
      voicePreferencesSchema.parse({
        localEndpoint: 'http://127.0.0.1:9/transcribe',
      }).localEndpoint,
    ).toBe('http://127.0.0.1:9/transcribe');
  });
});
