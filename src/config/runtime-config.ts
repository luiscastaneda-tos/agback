export interface RuntimeConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly port: number;
  readonly llmProvider: string;
  readonly llmModel: string;
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly openaiBaseUrl?: string;
  readonly llmApiKey?: string;
  readonly llmBaseUrl?: string;
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

function parsePublicClientKey(value: string | undefined): string {
  const key = requireNonEmpty('SUPABASE_ANON_KEY', value);
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return key;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      throw new Error();
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload?.role === 'anon') return key;
  } catch {
    // Never include the supplied key or parsing error.
  }
  throw new Error('Invalid environment variable: SUPABASE_ANON_KEY must be a public client key');
}

function parseSupabaseUrl(value: string | undefined): string {
  const candidate = parseHttpUrl('SUPABASE_URL', value);
  const url = new URL(candidate);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid environment variable: SUPABASE_URL');
  }
  return candidate;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const llmProvider = requireNonEmpty('LLM_PROVIDER', process.env.LLM_PROVIDER);
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();

  if (llmProvider === 'openai' && !openaiApiKey) {
    throw new Error('Missing or empty environment variable: OPENAI_API_KEY');
  }

  const model = process.env.OPENAI_MODEL?.trim()
    || process.env.LLM_MODEL?.trim()
    || (llmProvider === 'openai' ? 'gpt-4o-mini' : 'fictional-demo-model');

  const baseUrl = process.env.OPENAI_BASE_URL?.trim()
    || process.env.LLM_BASE_URL?.trim()
    || undefined;

  return {
    supabaseUrl: parseSupabaseUrl(process.env.SUPABASE_URL),
    supabaseAnonKey: parsePublicClientKey(process.env.SUPABASE_ANON_KEY),
    port: parseInteger('PORT', process.env.PORT, DEFAULT_PORT, 1, 65535),
    llmProvider,
    llmModel: model,
    openaiApiKey: openaiApiKey || undefined,
    openaiModel: model,
    openaiBaseUrl: baseUrl,
    llmApiKey: openaiApiKey || undefined,
    llmBaseUrl: baseUrl,
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
