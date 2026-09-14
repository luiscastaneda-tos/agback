import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversations/conversation.module';
import { EventModule } from './events/event.module';
import { TaskModule } from './tasks/task.module';

@Module({
  imports: [AuthModule, ConversationModule, EventModule, TaskModule],
})
export class AppModule {}
