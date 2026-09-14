import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AgentRegistryModule } from '../agents/registry/agent-registry.module';
import { ApprovalModule } from '../approvals/approval.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversations/conversation.module';
import { EventModule } from '../events/event.module';
import { TaskModule } from '../tasks/task.module';
import { AgentsController } from './agents.controller';
import { ApprovalDecisionsController } from './approval-decisions.controller';
import { ConversationApprovalsController } from './conversation-approvals.controller';
import { ConversationEventsController } from './conversation-events.controller';
import { ConversationMessagesController } from './conversation-messages.controller';
import { ConversationTasksController } from './conversation-tasks.controller';
import { ConversationsController } from './conversations.controller';
import { HttpErrorFilter } from './http-error.filter';

@Module({
  imports: [AuthModule, ConversationModule, EventModule, AgentRegistryModule, ApprovalModule, TaskModule],
  providers: [{ provide: APP_FILTER, useClass: HttpErrorFilter }],
  controllers: [ConversationEventsController, AgentsController, ApprovalDecisionsController, ConversationsController, ConversationMessagesController, ConversationApprovalsController, ConversationTasksController],
})
export class HttpModule {}
