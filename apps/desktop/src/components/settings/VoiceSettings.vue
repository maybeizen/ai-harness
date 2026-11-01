<script setup lang="ts">
import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { toAppError, type VoicePreferences } from '@harness/contracts';
import { useSettingsStore } from '../../stores/settings';
import { transcriptionPlan, voiceRefusalMessage } from '../../shell/voice';
import { Button } from '../ui/button';
import { controlField } from '../ui/control-styles';
const preferences = useSettingsStore();
const transcript = ref('');
const message = ref('');
const busy = ref(false);
const plan = computed(() => transcriptionPlan(preferences.settings.voice));
function patch(update: Partial<VoicePreferences>) {
  void preferences.patch({
    voice: { ...preferences.settings.voice, ...update },
  });
}
async function allowMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    patch({ microphone: 'granted' });
    message.value = 'Microphone permission granted.';
  } catch {
    patch({ microphone: 'denied' });
    message.value = voiceRefusalMessage('microphone-denied');
  }
}
async function transcribe() {
  const decision = transcriptionPlan(preferences.settings.voice);
  transcript.value = '';
  if (!decision.ok) {
    message.value = voiceRefusalMessage(decision.reason);
    return;
  }
  busy.value = true;
  try {
    const text = await invoke('transcribe_voice', {
      request: {
        engine: preferences.settings.voice.engine,
        language: preferences.settings.voice.language,
        localCommand: preferences.settings.voice.localCommand,
        localEndpoint: preferences.settings.voice.localEndpoint,
      },
    });
    if (typeof text !== 'string' || !text.trim()) {
      message.value = 'Transcription failed. Nothing was transcribed.';
      return;
    }
    transcript.value = text;
    message.value = '';
  } catch (cause) {
    message.value = toAppError(cause).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="setting-section" aria-labelledby="voice-settings-heading">
    <div>
      <h3 id="voice-settings-heading" class="text-sm font-semibold">Voice</h3>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Transcription runs only through a local command or an explicit local
        endpoint. If that engine is absent, nothing is transcribed.
      </p>
    </div>
    <p class="text-xs leading-5">
      Microphone: {{ preferences.settings.voice.microphone }}
    </p>
    <Button variant="outline" @click="allowMicrophone"
      >Request microphone</Button
    >
    <div class="setting-grid">
      <label class="grid gap-2 text-xs font-medium"
        >Language<input
          :class="controlField"
          :value="preferences.settings.voice.language"
          @change="
            patch({ language: ($event.target as HTMLInputElement).value })
          "
      /></label>
      <label class="grid gap-2 text-xs font-medium"
        >Push to talk<input
          :class="controlField"
          :value="preferences.settings.voice.pushToTalk"
          @change="
            patch({ pushToTalk: ($event.target as HTMLInputElement).value })
          "
      /></label>
    </div>
    <label class="grid gap-2 text-xs font-medium"
      >Engine<select
        :class="controlField"
        :value="preferences.settings.voice.engine"
        @change="
          patch({
            engine: ($event.target as HTMLSelectElement)
              .value as VoicePreferences['engine'],
          })
        "
      >
        <option value="unconfigured">Unconfigured</option>
        <option value="local-command">Local command</option>
        <option value="local-endpoint">Local endpoint</option>
      </select></label
    >
    <label class="grid gap-2 text-xs font-medium"
      >Local command<input
        :class="controlField"
        :value="preferences.settings.voice.localCommand"
        spellcheck="false"
        @change="
          patch({ localCommand: ($event.target as HTMLInputElement).value })
        "
    /></label>
    <label class="grid gap-2 text-xs font-medium"
      >Local endpoint<input
        :class="controlField"
        :value="preferences.settings.voice.localEndpoint"
        spellcheck="false"
        @change="
          patch({ localEndpoint: ($event.target as HTMLInputElement).value })
        "
    /></label>
    <p v-if="!plan.ok" class="text-xs leading-5 text-muted-foreground">
      {{ voiceRefusalMessage(plan.reason) }}
    </p>
    <Button v-else variant="outline" :disabled="busy" @click="transcribe"
      >Transcribe</Button
    >
    <p v-if="transcript" class="text-sm">{{ transcript }}</p>
    <p v-if="message" role="alert" class="text-xs text-muted-foreground">
      {{ message }}
    </p>
  </section>
</template>
