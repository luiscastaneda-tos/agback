export interface VerifiedIdentity {
  readonly userId: string;
  readonly expiresAt: number;
}

export interface AuthTokenVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity>;
}

export const AUTH_TOKEN_VERIFIER = Symbol('AUTH_TOKEN_VERIFIER');

export class AuthenticationFailure extends Error {
  constructor(
    readonly code: 'AUTHENTICATION_FAILED' | 'AUTH_CONTEXT_EXPIRED' = 'AUTHENTICATION_FAILED',
  ) {
    super(code === 'AUTH_CONTEXT_EXPIRED'
      ? 'Authentication expired. Authenticate again.'
      : 'Authentication failed.');
  }
}
