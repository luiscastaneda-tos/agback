import { Controller, Get, HttpException, Param, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { ApprovalRequest } from '../approvals/approval-request';
import { InMemoryApprovalStore } from '../approvals/in-memory-approval.store';
import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';
import type { Conversation } from '../conversations/conversation';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';

@Controller('conversations')
@UseGuards(BearerAuthGuard)
export class ConversationApprovalsController {
  constructor(
    private readonly conversations: InMemoryConversationStore,
    private readonly approvals: InMemoryApprovalStore,
  ) {}

  @Get(':id/approvals')
  list(
    @Param('id') conversationId: string,
    @Req() request: AuthenticatedRequest,
  ): ApprovalRequest[] {
    const identity = request[REQUEST_AUTH];
    if (!identity) {
      throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
    }

    let conversation: Conversation | undefined;
    try {
      conversation = this.conversations.getById(conversationId);
    } catch {
      throw this.error(500, 'APPROVAL_LIST_FAILED', 'Unable to list approvals.');
    }
    if (!conversation || conversation.userId !== identity.userId) {
      throw this.error(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }

    try {
      // Explicit wire projection to frozen contracts/approval.ts (1.0.0).
      return this.approvals.listByConversation(conversationId).map((approval) => ({
        id: approval.id,
        conversationId: approval.conversationId,
        taskId: approval.taskId,
        action: approval.action,
        actionVersion: approval.actionVersion,
        requestedByAgent: approval.requestedByAgent,
        status: approval.status,
        summary: approval.summary,
        inputPreview: approval.inputPreview.map((field) => ({
          label: field.label,
          value: field.value,
          ...(field.emphasis === undefined ? {} : { emphasis: field.emphasis }),
        })),
        payloadHash: approval.payloadHash,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
        ...(approval.resolvedAt === undefined ? {} : { resolvedAt: approval.resolvedAt }),
        ...(approval.resolvedBy === undefined ? {} : { resolvedBy: approval.resolvedBy }),
        ...(approval.rejectionReason === undefined ? {} : { rejectionReason: approval.rejectionReason }),
      }));
    } catch {
      throw this.error(500, 'APPROVAL_LIST_FAILED', 'Unable to list approvals.');
    }
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
