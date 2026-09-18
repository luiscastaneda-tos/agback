import { Injectable } from '@nestjs/common';

import type {
  ConversationMemoryContext,
  ConversationMemoryMessage,
  RememberedHotelSearch,
} from './conversation-memory';

const MAX_RECENT_MESSAGES = 16;

interface ConversationMemoryRecord {
  messages: ConversationMemoryMessage[];
  lastHotelSearch?: RememberedHotelSearch;
}

/** Process-local assistant context. It is internal and never part of a wire contract. */
@Injectable()
export class ConversationMemoryStore {
  private readonly records = new Map<string, ConversationMemoryRecord>();

  appendMessage(conversationId: string, message: ConversationMemoryMessage): void {
    this.assertConversationId(conversationId);
    if (!message.text.trim()) {
      throw new TypeError('Conversation memory messages must not be blank.');
    }

    const current = this.records.get(conversationId) ?? { messages: [] };
    current.messages.push(structuredClone(message));
    if (current.messages.length > MAX_RECENT_MESSAGES) {
      current.messages.splice(0, current.messages.length - MAX_RECENT_MESSAGES);
    }
    this.records.set(conversationId, current);
  }

  setLastHotelSearch(conversationId: string, search: RememberedHotelSearch): void {
    this.assertConversationId(conversationId);
    const current = this.records.get(conversationId) ?? { messages: [] };
    current.lastHotelSearch = structuredClone(search);
    this.records.set(conversationId, current);
  }

  getContext(conversationId: string): ConversationMemoryContext {
    this.assertConversationId(conversationId);
    const current = this.records.get(conversationId);
    if (current === undefined) return { messages: [] };
    return structuredClone({
      messages: current.messages,
      ...(current.lastHotelSearch === undefined
        ? {}
        : { lastHotelSearch: current.lastHotelSearch }),
    });
  }

  private assertConversationId(conversationId: string): void {
    if (typeof conversationId !== 'string' || !conversationId.trim()) {
      throw new TypeError('A non-empty conversation id is required.');
    }
  }
}
