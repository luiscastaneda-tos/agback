import { Module } from '@nestjs/common';

import { ConversationMemoryStore } from './conversation-memory.store';

@Module({
  providers: [ConversationMemoryStore],
  exports: [ConversationMemoryStore],
})
export class ConversationMemoryModule {}
