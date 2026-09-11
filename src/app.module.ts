import { Module } from '@nestjs/common';

import { ConversationModule } from './conversations/conversation.module';

@Module({
  imports: [ConversationModule],
})
export class AppModule {}
