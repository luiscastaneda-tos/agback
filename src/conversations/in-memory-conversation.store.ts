import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  Conversation,
  ConversationState,
  CreateConversationInput,
  UpdateConversationInput,
} from './conversation';

@Injectable()
export class InMemoryConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  create(input: CreateConversationInput): Conversation {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: randomUUID(),
      userId: input.userId,
      ...(input.title === undefined ? {} : { title: input.title }),
      createdAt: now,
      updatedAt: now,
      state: {
        preferences: {},
        pendingUserNotes: [],
      },
    };

    this.conversations.set(conversation.id, conversation);
    return this.clone(conversation);
  }

  getById(id: string): Conversation | undefined {
    const conversation = this.conversations.get(id);
    return conversation === undefined ? undefined : this.clone(conversation);
  }

  update(
    id: string,
    input: UpdateConversationInput,
  ): Conversation | undefined {
    const existing = this.conversations.get(id);
    if (existing === undefined) {
      return undefined;
    }

    const updated: Conversation = {
      ...existing,
      ...(input.title === undefined ? {} : { title: input.title }),
      updatedAt: this.nextTimestamp(existing.updatedAt),
      state:
        input.state === undefined
          ? existing.state
          : this.mergeState(existing.state, input.state),
    };

    const stored = this.clone(updated);
    this.conversations.set(id, stored);
    return this.clone(stored);
  }

  private mergeState(
    current: ConversationState,
    changes: Partial<ConversationState>,
  ): ConversationState {
    return {
      preferences:
        changes.preferences === undefined
          ? current.preferences
          : changes.preferences,
      pendingUserNotes:
        changes.pendingUserNotes === undefined
          ? current.pendingUserNotes
          : changes.pendingUserNotes,
      ...(changes.lastAppliedAt === undefined
        ? current.lastAppliedAt === undefined
          ? {}
          : { lastAppliedAt: current.lastAppliedAt }
        : { lastAppliedAt: changes.lastAppliedAt }),
    };
  }

  private nextTimestamp(previous: string): string {
    return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
  }

  private clone(conversation: Conversation): Conversation {
    return structuredClone(conversation);
  }
}
