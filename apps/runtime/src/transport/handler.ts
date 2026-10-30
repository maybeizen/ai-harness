import {
  PROTOCOL_VERSION,
  requestSchema,
  type RuntimeResponse,
} from '@harness/contracts';
export function handleLine(line: string): {
  response: RuntimeResponse;
  shutdown: boolean;
} {
  let candidate: unknown;
  try {
    candidate = JSON.parse(line);
  } catch {
    candidate = null;
  }
  const parsed = requestSchema.safeParse(candidate);
  const object =
    typeof candidate === 'object' && candidate !== null
      ? (candidate as Record<string, unknown>)
      : {};
  const id =
    typeof object['id'] === 'string' && object['id'].length <= 128
      ? object['id']
      : '';
  if (!parsed.success) {
    const versionMismatch =
      object['version'] !== undefined && object['version'] !== PROTOCOL_VERSION;
    return {
      response: {
        version: PROTOCOL_VERSION,
        id,
        ok: false,
        error: {
          code: versionMismatch ? 'VERSION_MISMATCH' : 'INVALID_REQUEST',
          message: 'Request rejected',
        },
      },
      shutdown: false,
    };
  }
  return {
    response: {
      version: PROTOCOL_VERSION,
      id: parsed.data.id,
      ok: true,
      result: { status: 'ready', protocol: PROTOCOL_VERSION, storage: 'ready' },
    },
    shutdown: parsed.data.method === 'shutdown',
  };
}
