import { Module } from '@nestjs/common';

import { loadRuntimeConfig } from '../config/runtime-config';
import { AuthContextService, ExecutionCredentialResolver } from './auth-context.service';
import { AUTH_TOKEN_VERIFIER } from './auth-token-verifier';
import { BearerAuthGuard } from './bearer-auth.guard';
import { SupabaseAuthTokenVerifier } from './supabase-auth-token-verifier';

@Module({
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      useFactory: () => new SupabaseAuthTokenVerifier(loadRuntimeConfig()),
    },
    AuthContextService,
    BearerAuthGuard,
    {
      provide: ExecutionCredentialResolver,
      inject: [AuthContextService],
      useFactory: (contexts: AuthContextService) => contexts.createExecutionResolver(),
    },
  ],
  exports: [BearerAuthGuard, AuthContextService, ExecutionCredentialResolver],
})
export class AuthModule {}
