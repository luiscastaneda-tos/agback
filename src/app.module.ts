import { Module } from '@nestjs/common';

import { ConversationModule } from './conversations/conversation.module';
import { EventModule } from './events/event.module';
import { TaskModule } from './tasks/task.module';

@Module({
  imports: [ConversationModule, EventModule, TaskModule],
})
export class AppModule {}
