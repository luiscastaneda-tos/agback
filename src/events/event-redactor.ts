import { AgentEventType } from './agent-event';

const FORBIDDEN_KEY_PARTS = [
  'token',
  'authorization',
  'credential',
  'password',
  'passwd',
  'secret',
  'authcontextid',
  'authhandle',
  'authenticationhandle',
  'apikey',
  'privatekey',
  'reasoning',
  'chainofthought',
  'scratchpad',
] as const;

const RAW_ARGUMENT_KEYS = new Set([
  'args',
  'arguments',
  'rawargs',
  'rawarguments',
  'toolargs',
  'toolarguments',
  'rawtoolargs',
  'rawtoolarguments',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);

  return (
    RAW_ARGUMENT_KEYS.has(normalizedKey) ||
    FORBIDDEN_KEY_PARTS.some((part) => normalizedKey.includes(part))
  );
}

function redactValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const existingCopy = seen.get(value);
  if (existingCopy !== undefined) {
    return existingCopy;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(redactValue(item, seen));
    }
    return copy;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, nestedValue] of Object.entries(value)) {
    if (!isForbiddenKey(key)) {
      copy[key] = redactValue(nestedValue, seen);
    }
  }
  return copy;
}

function redactToolCalledPayload(payload: unknown): {
  action: string;
  argsPreview: Array<{ label: string; value: string }>;
} {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { action: '', argsPreview: [] };
  }

  const candidate = payload as Record<string, unknown>;
  const argsPreview = Array.isArray(candidate.argsPreview)
    ? candidate.argsPreview.flatMap((entry) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          return [];
        }

        const preview = entry as Record<string, unknown>;
        return typeof preview.label === 'string' &&
          typeof preview.value === 'string'
          ? [{ label: preview.label, value: preview.value }]
          : [];
      })
    : [];

  return {
    action: typeof candidate.action === 'string' ? candidate.action : '',
    argsPreview,
  };
}

export function redactEventPayload<TPayload>(
  type: AgentEventType,
  payload: TPayload,
): TPayload {
  const sanitized =
    type === 'tool.called'
      ? redactToolCalledPayload(payload)
      : redactValue(payload, new WeakMap<object, unknown>());

  return sanitized as TPayload;
}
