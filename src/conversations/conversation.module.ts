import { Module } from '@nestjs/common';

import { InMemoryConversationStore } from './in-memory-conversation.store';

@Module({
  providers: [InMemoryConversationStore],
  exports: [InMemoryConversationStore],
})
export class ConversationModule {}
