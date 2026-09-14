import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { RuntimeConfig } from '../config/runtime-config';
import { AuthenticationFailure, AuthTokenVerifier, VerifiedIdentity } from './auth-token-verifier';

export class SupabaseAuthTokenVerifier implements AuthTokenVerifier {
  readonly #client: SupabaseClient;

  constructor(config: RuntimeConfig) {
    this.#client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        debug: false,
      },
    });
  }

  async verify(accessToken: string): Promise<VerifiedIdentity> {
    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
        throw new AuthenticationFailure();
      }
      // Claims supply retention metadata only. Identity requires getUser below.
      const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (!claims || typeof claims !== 'object' || !('exp' in claims) ||
          typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) ||
          claims.exp <= 0 || !Number.isSafeInteger(claims.exp * 1000) ||
          claims.exp * 1000 > 8.64e15) {
        throw new AuthenticationFailure();
      }
      const expiresAt = claims.exp * 1000;
      if (expiresAt <= Date.now()) throw new AuthenticationFailure('AUTH_CONTEXT_EXPIRED');
      const { data, error } = await this.#client.auth.getUser(accessToken);
      if (error || !data.user || typeof data.user.id !== 'string' || !data.user.id.trim()) {
        throw new AuthenticationFailure();
      }
      if (expiresAt <= Date.now()) throw new AuthenticationFailure('AUTH_CONTEXT_EXPIRED');
      return { userId: data.user.id, expiresAt };
    } catch (error) {
      if (error instanceof AuthenticationFailure) throw error;
      throw new AuthenticationFailure();
    }
  }
}
