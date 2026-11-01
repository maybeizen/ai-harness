import { describe, expect, it } from 'vitest';
import {
  conversationSchema,
  conversationSummarySchema,
  savedMessageSchema,
  settingsSchema,
  storageOperationSchema,
} from './storage';

const message = {
  id: 'message-1',
  role: 'assistant',
  text: 'Unicode survives: こんにちは 👋',
  status: 'completed',
} as const;
const conversation = {
  id: 'conversation-1',
  title: 'A conversation',
  pinned: false,
  updatedAt: 123,
  messages: [message],
};

describe('persistent data contracts', () => {
  it('preserves structured messages and rejects unknown or invalid fields', () => {
    expect(conversationSchema.parse(conversation)).toEqual(conversation);
    for (const candidate of [
      { ...message, role: 'system' },
      { ...message, status: 'finished' },
      { ...message, connectionId: 'removed-provider' },
      { ...message, credential: 'must-not-persist' },
      { ...message, modelName: 'x'.repeat(257) },
    ]) {
      expect(savedMessageSchema.safeParse(candidate).success).toBe(false);
    }
    expect(
      conversationSchema.safeParse({ ...conversation, apiKey: 'secret' })
        .success,
    ).toBe(false);
  });

  it('bounds conversation identities, titles, dates, and message counts', () => {
    for (const patch of [
      { id: '' },
      { id: 'x'.repeat(129) },
      { title: '' },
      { title: 'x'.repeat(201) },
      { updatedAt: -1 },
      { updatedAt: 1.5 },
      { updatedAt: Number.POSITIVE_INFINITY },
      { pinned: 'false' },
      { messages: Array.from({ length: 1001 }, () => message) },
    ]) {
      expect(
        conversationSchema.safeParse({ ...conversation, ...patch }).success,
      ).toBe(false);
    }
    expect(
      conversationSchema.safeParse({
        ...conversation,
        id: 'x'.repeat(128),
        title: 'x'.repeat(200),
        messages: [],
      }).success,
    ).toBe(true);
  });

  it('prevents message content from appearing in summary payloads', () => {
    const summary = {
      id: conversation.id,
      title: conversation.title,
      pinned: conversation.pinned,
      updatedAt: conversation.updatedAt,
    };
    expect(conversationSummarySchema.parse(summary)).toEqual(summary);
    expect(conversationSummarySchema.safeParse(conversation).success).toBe(
      false,
    );
  });

  it('rejects future preference schema versions without discarding them', () => {
    expect(settingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });

  it('supplies validated defaults for older or incomplete preferences', () => {
    expect(settingsSchema.parse({})).toEqual({
      schemaVersion: 1,
      selectedMode: 'ask',
      permissionPolicy: 'manual',
      activeDirectory: null,
      shortcuts: {
        newChat: 'CtrlOrMeta+N',
        sidebar: 'CtrlOrMeta+B',
        settings: 'CtrlOrMeta+,',
        focusComposer: 'CtrlOrMeta+J',
        openWorkspace: 'CtrlOrMeta+O',
        cancel: 'Escape',
      },
      rightPanelOpen: false,
      rightPanelWidth: 480,
      customAccent: null,
      customBackground: null,
      customSurface: null,
      customText: null,
      customHighlight: null,
      borderIntensity: 0.5,
      fontScale: 1,
      sidebarWidth: 248,
      chatWidth: 768,
      compactTitlebar: false,
      background: {
        assetId: null,
        opacity: 0.25,
        blur: 0,
        overlay: 0.5,
        position: 'center',
        scope: 'conversation',
      },
      theme: 'dark',
      accent: 'mint',
      density: 'comfortable',
      reducedMotion: false,
      sidebarOpen: true,
      selectedProvider: 'chatgpt',
      selectedModel: '',
      activeConversation: null,
      fontFamily: 'system',
      window: null,
      terminal: { shell: '', fontSize: 13, scrollback: 5000 },
      editor: { tabSize: 2, wordWrap: false, minimap: false },
      notifications: {
        taskCompletion: true,
        approvalRequests: true,
        errors: true,
        sound: false,
        doNotDisturb: false,
      },
      voice: {
        microphone: 'unknown',
        language: 'en',
        pushToTalk: 'CtrlOrMeta+Shift+M',
        engine: 'unconfigured',
        localCommand: '',
        localEndpoint: '',
      },
      sidebarGroups: {
        projects: true,
        directories: true,
        conversations: true,
      },
      retention: {
        enabled: false,
        maxAgeDays: null,
        maxConversations: null,
        confirmBeforeDelete: true,
        preserveActiveConversation: true,
      },
      generation: {},
    });
    expect(settingsSchema.parse({ theme: 'light' }).theme).toBe('light');
    for (const candidate of [
      { theme: 'unknown' },
      { selectedProvider: 'removed-provider' },
      { selectedModel: 'x'.repeat(257) },
      { activeConversation: 'x'.repeat(129) },
      { sidebarOpen: 1 },
      { reducedMotion: 'false' },
      { apiKey: 'secret' },
      null,
      [],
    ]) {
      expect(settingsSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it('restricts storage requests to explicit validated operations', () => {
    for (const request of [
      { action: 'list' },
      { action: 'get', id: 'conversation-1' },
      { action: 'delete', id: 'conversation-1' },
      {
        action: 'update',
        id: 'conversation-1',
        title: 'Renamed',
        pinned: true,
      },
      { action: 'settings.get' },
      { action: 'settings.set', settings: {} },
    ]) {
      expect(storageOperationSchema.safeParse(request).success).toBe(true);
    }
    for (const request of [
      { action: 'execute', sql: 'DROP TABLE conversations' },
      { action: 'list', credential: 'secret' },
      { action: 'get', id: '' },
      { action: 'delete' },
      { action: 'update', id: 'conversation-1', title: 'Renamed' },
      { action: 'settings.set', settings: { theme: 'invalid' } },
    ]) {
      expect(storageOperationSchema.safeParse(request).success).toBe(false);
    }
  });
});
