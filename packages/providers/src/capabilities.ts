import type {
  ConnectionKind,
  ModelCapabilities,
  Support,
} from '@harness/contracts';
const blank = (): ModelCapabilities => ({
  tools: 'unknown',
  images: 'unknown',
  structuredOutput: 'unknown',
  reasoningEffort: 'unknown',
  temperature: 'unknown',
  maxOutputTokens: 'unknown',
  vision: 'unknown',
});
function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}
function finite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
function positive(value: unknown): boolean {
  return finite(value) && (value as number) > 0;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function setVision(capabilities: ModelCapabilities, value: Support) {
  capabilities.vision = value;
  capabilities.images = value;
}
function matches(id: string, token: string): boolean {
  if (id === token || id.startsWith(`${token}-`) || id.startsWith(`${token}.`))
    return true;
  return (
    (token === 'gpt-4' || token === 'gpt-5') &&
    (id === `${token}o` ||
      id.startsWith(`${token}o-`) ||
      id.startsWith(`${token}o.`))
  );
}
function anyMatch(id: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => matches(id, token));
}
function openaiFamily(id: string): Partial<ModelCapabilities> {
  if (!/^(gpt-|chatgpt-|o[1-9])/.test(id)) return {};
  const preview = anyMatch(id, ['o1-mini', 'o1-preview']);
  const reasoning =
    anyMatch(id, ['o1', 'o3', 'o4', 'gpt-5']) && !id.includes('-chat');
  const chat =
    anyMatch(id, ['gpt-4', 'gpt-3.5', 'chatgpt-4o']) ||
    id.includes('gpt-5-chat');
  const visionNo = anyMatch(id, [
    'gpt-3.5',
    'gpt-4-0613',
    'gpt-4-0314',
    'o1-mini',
    'o1-preview',
    'o3-mini',
  ]);
  const visionYes =
    anyMatch(id, [
      'gpt-4o',
      'gpt-4.1',
      'gpt-4-turbo',
      'gpt-4-vision',
      'chatgpt-4o',
      'gpt-5',
      'o1',
      'o3',
      'o4',
    ]) &&
    !preview &&
    !anyMatch(id, ['gpt-5-nano', 'o3-mini']);
  const toolsYes =
    !preview &&
    anyMatch(id, [
      'gpt-4',
      'gpt-3.5-turbo',
      'chatgpt-4o',
      'o1',
      'o3',
      'o4',
      'gpt-5',
    ]);
  const vision: Support = visionNo
    ? 'unsupported'
    : visionYes
      ? 'supported'
      : 'unknown';
  return {
    tools: preview ? 'unsupported' : toolsYes ? 'supported' : 'unknown',
    temperature: reasoning ? 'unsupported' : chat ? 'supported' : 'unknown',
    reasoningEffort: reasoning ? 'supported' : chat ? 'unsupported' : 'unknown',
    maxOutputTokens:
      toolsYes || chat || reasoning || preview ? 'supported' : 'unknown',
    vision,
    images: vision,
    structuredOutput: anyMatch(id, ['gpt-4o', 'gpt-4.1', 'gpt-5', 'o3', 'o4'])
      ? 'supported'
      : 'unknown',
  };
}
function anthropicFamily(id: string): Partial<ModelCapabilities> {
  if (!/^claude-(3|opus|sonnet|haiku)/.test(id)) return {};
  return {
    tools: 'supported',
    images: 'supported',
    vision: 'supported',
    temperature: 'supported',
    maxOutputTokens: 'supported',
    reasoningEffort: /^claude-(opus|sonnet|haiku)-4/.test(id)
      ? 'supported'
      : 'unknown',
    structuredOutput: 'unknown',
  };
}
function googleFamily(id: string): Partial<ModelCapabilities> {
  if (!/^gemini-(1\.0-pro|1\.5|2\.|3\.)/.test(id)) return {};
  const visionNo = /^gemini-1\.0-pro/.test(id);
  const visionYes = /^gemini-(1\.5|2\.|3\.)/.test(id);
  const vision: Support = visionNo
    ? 'unsupported'
    : visionYes
      ? 'supported'
      : 'unknown';
  return {
    tools: 'supported',
    temperature: 'supported',
    maxOutputTokens: 'supported',
    vision,
    images: vision,
    structuredOutput: visionYes ? 'supported' : 'unknown',
    reasoningEffort: 'unknown',
  };
}
function xaiFamily(id: string): Partial<ModelCapabilities> {
  if (!/^grok-(2|3|4|code)/.test(id)) return {};
  const reasoning = /^grok-(3-mini|4|code)/.test(id);
  const visionNo = /^grok-2(?!-vision)/.test(id);
  const visionYes =
    /^grok-2-vision/.test(id) ||
    /^grok-4/.test(id) ||
    /^grok-3(?!-mini)/.test(id);
  const vision: Support = visionNo
    ? 'unsupported'
    : visionYes
      ? 'supported'
      : 'unknown';
  return {
    tools: 'supported',
    temperature: /^grok-3-mini/.test(id) ? 'unsupported' : 'supported',
    reasoningEffort: reasoning
      ? 'supported'
      : /^grok-2/.test(id)
        ? 'unsupported'
        : 'unknown',
    maxOutputTokens: 'supported',
    vision,
    images: vision,
    structuredOutput: 'unknown',
  };
}
function applyFamily(
  capabilities: ModelCapabilities,
  kind: ConnectionKind,
  id: string,
) {
  const family =
    kind === 'openai' || kind === 'chatgpt'
      ? openaiFamily(id)
      : kind === 'anthropic'
        ? anthropicFamily(id)
        : kind === 'google'
          ? googleFamily(id)
          : kind === 'xai'
            ? xaiFamily(id)
            : {};
  Object.assign(capabilities, family);
}
function applyParameters(capabilities: ModelCapabilities, names: string[]) {
  const params = new Set(names.map((name) => name.toLowerCase()));
  const listed = (...keys: string[]) => keys.some((key) => params.has(key));
  const level = (present: boolean): Support =>
    present ? 'supported' : 'unsupported';
  capabilities.tools = level(listed('tools', 'tool_choice'));
  capabilities.temperature = level(listed('temperature'));
  capabilities.maxOutputTokens = level(
    listed('max_tokens', 'max_completion_tokens', 'max_output_tokens'),
  );
  capabilities.reasoningEffort = level(
    listed('reasoning', 'reasoning_effort', 'include_reasoning'),
  );
  capabilities.structuredOutput = level(
    listed('response_format', 'structured_outputs', 'json_schema'),
  );
}
function applyModalities(capabilities: ModelCapabilities, names: string[]) {
  const image = names.some((name) => {
    const value = name.toLowerCase();
    return value === 'image' || value === 'vision';
  });
  setVision(capabilities, image ? 'supported' : 'unsupported');
}
function applyCapabilityList(capabilities: ModelCapabilities, names: string[]) {
  const values = new Set(names.map((name) => name.toLowerCase()));
  capabilities.tools = values.has('tools') ? 'supported' : 'unsupported';
  setVision(capabilities, values.has('vision') ? 'supported' : 'unsupported');
}
function applyCapabilityObject(
  capabilities: ModelCapabilities,
  value: Record<string, unknown>,
) {
  if (typeof value.tools === 'boolean')
    capabilities.tools = value.tools ? 'supported' : 'unsupported';
  if (typeof value.tool_use === 'boolean')
    capabilities.tools = value.tool_use ? 'supported' : 'unsupported';
  if (typeof value.image_input === 'boolean')
    setVision(capabilities, value.image_input ? 'supported' : 'unsupported');
  if (typeof value.effort === 'boolean')
    capabilities.reasoningEffort = value.effort ? 'supported' : 'unsupported';
}
function applyExplicit(
  capabilities: ModelCapabilities,
  row: Record<string, unknown>,
) {
  const parameters =
    strings(row.supported_parameters) ?? strings(row.supportedParameters);
  if (parameters) applyParameters(capabilities, parameters);
  const architecture = record(row.architecture);
  const modalities =
    strings(row.input_modalities) ??
    strings(architecture?.input_modalities) ??
    strings(architecture?.inputModalities);
  if (modalities) applyModalities(capabilities, modalities);
  const listed = row.capabilities;
  if (Array.isArray(listed)) {
    const names = strings(listed);
    if (names) applyCapabilityList(capabilities, names);
  } else {
    const object = record(listed);
    if (object) applyCapabilityObject(capabilities, object);
  }
  if (
    positive(row.outputTokenLimit) ||
    positive(row.max_tokens) ||
    positive(row.max_output_tokens) ||
    positive(row.max_completion_tokens)
  )
    capabilities.maxOutputTokens = 'supported';
  if (finite(row.maxTemperature) || finite(row.temperature))
    capabilities.temperature = 'supported';
}
export function modelCapabilities(
  kind: ConnectionKind,
  id: string,
  row: object,
): ModelCapabilities {
  const capabilities = blank();
  applyFamily(capabilities, kind, id);
  applyExplicit(capabilities, row as Record<string, unknown>);
  const vision = capabilities.vision ?? 'unknown';
  if (vision !== 'unknown') capabilities.images = vision;
  else if (capabilities.images !== 'unknown')
    capabilities.vision = capabilities.images;
  return capabilities;
}
