import { Module } from '@nestjs/common';

import { TaskModule } from '../tasks/task.module';
import { InMemoryConversationStore } from './in-memory-conversation.store';
import { MessageSubmissionService } from './message-submission.service';

@Module({
  imports: [TaskModule],
  providers: [InMemoryConversationStore, MessageSubmissionService],
  exports: [InMemoryConversationStore, MessageSubmissionService],
})
export class ConversationModule {}
