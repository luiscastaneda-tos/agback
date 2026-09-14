import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversations/conversation.module';
import { EventModule } from '../events/event.module';
import { ConversationEventsController } from './conversation-events.controller';

@Module({
  imports: [AuthModule, ConversationModule, EventModule],
  controllers: [ConversationEventsController],
})
export class HttpModule {}
