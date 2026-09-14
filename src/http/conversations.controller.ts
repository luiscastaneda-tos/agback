import { Controller, HttpCode, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthenticationFailure } from '../auth/auth-token-verifier';
import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';
import type { Conversation } from '../conversations/conversation';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';

@Controller('conversations')
@UseGuards(BearerAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: InMemoryConversationStore) {}

  @Post()
  @HttpCode(201)
  create(@Req() request: AuthenticatedRequest): Conversation {
    try {
      const identity = request[REQUEST_AUTH];
      if (!identity || typeof identity.userId !== 'string' || identity.userId.trim().length === 0) {
        throw new AuthenticationFailure();
      }

      const conversation = this.conversations.create({ userId: identity.userId });

      // Explicit wire projection to frozen contracts/conversation.ts (1.0.0).
      return {
        id: conversation.id,
        userId: conversation.userId,
        ...(conversation.title === undefined ? {} : { title: conversation.title }),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        state: {
          preferences: { ...conversation.state.preferences },
          pendingUserNotes: [...conversation.state.pendingUserNotes],
          ...(conversation.state.lastAppliedAt === undefined
            ? {}
            : { lastAppliedAt: conversation.state.lastAppliedAt }),
        },
      };
    } catch (error) {
      if (error instanceof AuthenticationFailure) {
        throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
      }
      throw this.error(500, 'CONVERSATION_CREATION_FAILED', 'Unable to create conversation.');
    }
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
