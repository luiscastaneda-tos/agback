import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversations/conversation.module';
import { EventModule } from './events/event.module';
import { HttpModule } from './http/http.module';
import { TaskModule } from './tasks/task.module';
import { ToolModule } from './tools/tool.module';

@Module({
  imports: [AuthModule, ConversationModule, EventModule, TaskModule, HttpModule, ToolModule],
})
export class AppModule {}
