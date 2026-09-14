import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthContextService, AuthenticationContext } from './auth-context.service';
import { AuthenticationFailure } from './auth-token-verifier';

export const REQUEST_AUTH = Symbol('REQUEST_AUTH');

export interface AuthenticatedRequest {
  headers: { authorization?: string | string[] };
  [REQUEST_AUTH]?: AuthenticationContext;
}

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly contexts: AuthContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const header = request.headers.authorization;
      const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header) : null;
      if (!match) throw new AuthenticationFailure();
      const identity = await this.contexts.authenticate(match[1]);
      Object.defineProperty(request, REQUEST_AUTH, {
        value: identity, enumerable: false, configurable: true,
      });
      return true;
    } catch (error) {
      const failure = error instanceof AuthenticationFailure ? error : new AuthenticationFailure();
      throw new UnauthorizedException({
        error: {
          code: failure.code,
          message: failure.message,
          requestId: 'req_' + randomUUID(),
        },
      });
    }
  }
}
