import { Module } from '@nestjs/common';

import { AgentRegistryModule } from '../agents/registry/agent-registry.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversations/conversation.module';
import { EventModule } from '../events/event.module';
import { AgentsController } from './agents.controller';
import { ConversationEventsController } from './conversation-events.controller';

@Module({
  imports: [AuthModule, ConversationModule, EventModule, AgentRegistryModule],
  controllers: [ConversationEventsController, AgentsController],
})
export class HttpModule {}
