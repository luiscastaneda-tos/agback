import { Module } from '@nestjs/common';

import { ConversationModule } from './conversations/conversation.module';
import { EventModule } from './events/event.module';

@Module({
  imports: [ConversationModule, EventModule],
})
export class AppModule {}
