import { Body, Controller, HttpCode, HttpException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthenticationFailure } from '../auth/auth-token-verifier';
import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';
import { MessageAcceptance, MessageSubmissionFailure, MessageSubmissionService } from '../conversations/message-submission.service';

@Controller('conversations')
@UseGuards(BearerAuthGuard)
export class ConversationMessagesController {
  constructor(private readonly submissions: MessageSubmissionService) {}

  @Post(':id/messages')
  @HttpCode(202)
  submit(
    @Param('id') conversationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): MessageAcceptance {
    try {
      const identity = request[REQUEST_AUTH];
      if (!identity) throw new AuthenticationFailure();
      const acceptance = this.submissions.submit(
        conversationId, identity.userId, identity.authContextId, body,
      );

      // Explicit wire projection to frozen ChatResponse (1.0.0).
      return {
        messageId: acceptance.messageId,
        conversationId: acceptance.conversationId,
        accepted: true,
        createdTaskIds: [...acceptance.createdTaskIds],
      };
    } catch (error) {
      if (error instanceof AuthenticationFailure) {
        throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
      }
      if (error instanceof MessageSubmissionFailure) {
        if (error.code === 'CONVERSATION_NOT_FOUND') {
          throw this.error(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
        }
        throw this.error(400, 'INVALID_CHAT_REQUEST', 'Invalid chat request.');
      }
      throw this.error(500, 'MESSAGE_SUBMISSION_FAILED', 'Unable to accept message.');
    }
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
