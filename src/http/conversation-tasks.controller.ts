import { Controller, Get, HttpException, Param, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthenticatedRequest, BearerAuthGuard, REQUEST_AUTH } from '../auth/bearer-auth.guard';
import type { Conversation } from '../conversations/conversation';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import type { AgentTask } from '../tasks/agent-task';
import { InMemoryTaskStore } from '../tasks/in-memory-task.store';

@Controller('conversations')
@UseGuards(BearerAuthGuard)
export class ConversationTasksController {
  constructor(
    private readonly conversations: InMemoryConversationStore,
    private readonly tasks: InMemoryTaskStore,
  ) {}

  @Get(':id/tasks')
  list(
    @Param('id') conversationId: string,
    @Req() request: AuthenticatedRequest,
  ): AgentTask[] {
    const identity = request[REQUEST_AUTH];
    if (!identity) {
      throw this.error(401, 'AUTHENTICATION_FAILED', 'Authentication failed.');
    }

    let conversation: Conversation | undefined;
    try {
      conversation = this.conversations.getById(conversationId);
    } catch {
      throw this.error(500, 'TASK_LIST_FAILED', 'Unable to list tasks.');
    }
    if (!conversation || conversation.userId !== identity.userId) {
      throw this.error(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }

    try {
      // Explicit wire projection to frozen contracts/task.ts (1.0.0), per D-025.
      return this.tasks.listByConversation(conversationId).map((task) => ({
        id: task.id,
        conversationId: task.conversationId,
        agentName: task.agentName,
        goal: task.goal,
        status: task.status,
        authContextId: task.authContextId,
        createdAt: task.createdAt,
        ...(task.parentTaskId === undefined ? {} : { parentTaskId: task.parentTaskId }),
        ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
        ...(task.finishedAt === undefined ? {} : { finishedAt: task.finishedAt }),
        ...(task.result === undefined ? {} : {
          result: {
            kind: task.result.kind,
            data: task.result.data,
            summary: task.result.summary,
          },
        }),
        ...(task.failure === undefined ? {} : {
          failure: {
            code: task.failure.code,
            message: task.failure.message,
          },
        }),
        ...(task.activeApprovalId === undefined ? {} : { activeApprovalId: task.activeApprovalId }),
      }));
    } catch {
      throw this.error(500, 'TASK_LIST_FAILED', 'Unable to list tasks.');
    }
  }

  private error(status: number, code: string, message: string): HttpException {
    return new HttpException({
      error: { code, message, requestId: 'req_' + randomUUID() },
    }, status);
  }
}
