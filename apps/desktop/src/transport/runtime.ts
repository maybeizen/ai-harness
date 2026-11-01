import { invoke } from '@tauri-apps/api/core';
import { responseSchema } from '@harness/contracts';
export async function runtimeHealth() {
  const result = responseSchema.parse(await invoke('runtime_health'));
  if (!result.ok) throw new Error(result.error.code);
  return result.result;
}
