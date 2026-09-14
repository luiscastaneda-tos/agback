import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { AUTH_TOKEN_VERIFIER, AuthenticationFailure, AuthTokenVerifier } from './auth-token-verifier';

export interface AuthenticationContext {
  readonly authContextId: string;
  readonly userId: string;
  readonly expiresAt: number;
}

interface CredentialRecord {
  readonly userId: string;
  readonly accessToken: string;
  readonly expiresAt: number;
}

// This separate capability is for ToolInvoker's ephemeral execution context only.
export abstract class ExecutionCredentialResolver {
  abstract resolveForExecution(authContextId: string): Readonly<CredentialRecord>;
}

@Injectable()
export class AuthContextService implements OnModuleDestroy {
  readonly #records = new Map<string, CredentialRecord>();
  readonly #eviction = setInterval(() => {
    const now = Date.now();
    for (const [id, record] of this.#records) {
      if (record.expiresAt <= now) this.#records.delete(id);
    }
  }, 1000).unref();

  constructor(@Inject(AUTH_TOKEN_VERIFIER) private readonly verifier: AuthTokenVerifier) {}

  async authenticate(accessToken: string): Promise<AuthenticationContext> {
    const identity = await this.verifier.verify(accessToken);
    if (identity.expiresAt <= Date.now()) throw new AuthenticationFailure('AUTH_CONTEXT_EXPIRED');
    const authContextId = randomBytes(32).toString('hex');
    this.#records.set(authContextId, { ...identity, accessToken });
    return Object.freeze({ authContextId, ...identity });
  }

  lookup(authContextId: string): AuthenticationContext {
    const { userId, expiresAt } = this.#requireActive(authContextId);
    return Object.freeze({ authContextId, userId, expiresAt });
  }

  /** Internal module wiring; never pass this capability to agents or HTTP callers. */
  createExecutionResolver(): ExecutionCredentialResolver {
    return {
      resolveForExecution: (authContextId) => Object.freeze({ ...this.#requireActive(authContextId) }),
    };
  }

  #requireActive(authContextId: string): CredentialRecord {
    const record = this.#records.get(authContextId);
    if (!record || record.expiresAt <= Date.now()) {
      this.#records.delete(authContextId);
      throw new AuthenticationFailure('AUTH_CONTEXT_EXPIRED');
    }
    return record;
  }

  onModuleDestroy(): void {
    clearInterval(this.#eviction);
    this.#records.clear();
  }
}
