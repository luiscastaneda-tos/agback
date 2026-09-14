import { Module } from '@nestjs/common';

import { AgentRegistryModule } from '../agents/registry/agent-registry.module';
import { ApprovalModule } from '../approvals/approval.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversations/conversation.module';
import { EventModule } from '../events/event.module';
import { AgentsController } from './agents.controller';
import { ApprovalDecisionsController } from './approval-decisions.controller';
import { ConversationEventsController } from './conversation-events.controller';
import { ConversationsController } from './conversations.controller';

@Module({
  imports: [AuthModule, ConversationModule, EventModule, AgentRegistryModule, ApprovalModule],
  controllers: [ConversationEventsController, AgentsController, ApprovalDecisionsController, ConversationsController],
})
export class HttpModule {}
