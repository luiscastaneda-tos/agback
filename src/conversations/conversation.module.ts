import { Module } from '@nestjs/common';

import { TaskModule } from '../tasks/task.module';
import { ConversationMemoryModule } from '../memory/conversation-memory.module';
import { InMemoryConversationStore } from './in-memory-conversation.store';
import { MessageSubmissionService } from './message-submission.service';

@Module({
  imports: [TaskModule, ConversationMemoryModule],
  providers: [InMemoryConversationStore, MessageSubmissionService],
  exports: [InMemoryConversationStore, MessageSubmissionService],
})
export class ConversationModule {}
