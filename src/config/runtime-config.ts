export interface RuntimeConfig {
  readonly port: number;
  readonly llmProvider: string;
  readonly llmModel: string;
  readonly approvalTtlMs: number;
  readonly noktosBaseUrl: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_APPROVAL_TTL_MS = 15 * 60 * 1000;

function requireNonEmpty(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing or empty environment variable: ${name}`);
  }

  return value.trim();
}

function parseInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum?: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid environment variable: ${name} must be an integer`);
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new Error(`Invalid environment variable: ${name} is out of range`);
  }

  return parsed;
}

function parseHttpUrl(name: string, value: string | undefined): string {
  const candidate = requireNonEmpty(name, value);

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.hostname.length === 0
    ) {
      throw new Error('unsupported URL');
    }
  } catch {
    throw new Error(
      `Invalid environment variable: ${name} must be an absolute HTTP or HTTPS URL`,
    );
  }

  return candidate;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    port: parseInteger('PORT', process.env.PORT, DEFAULT_PORT, 1, 65535),
    llmProvider: requireNonEmpty('LLM_PROVIDER', process.env.LLM_PROVIDER),
    llmModel: requireNonEmpty('LLM_MODEL', process.env.LLM_MODEL),
    approvalTtlMs: parseInteger(
      'APPROVAL_TTL_MS',
      process.env.APPROVAL_TTL_MS,
      DEFAULT_APPROVAL_TTL_MS,
      1,
    ),
    noktosBaseUrl: parseHttpUrl(
      'NOKTOS_BASE_URL',
      process.env.NOKTOS_BASE_URL,
    ),
  };
}
