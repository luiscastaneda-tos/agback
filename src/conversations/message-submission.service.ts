import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { TaskQueueService } from '../tasks/task-queue.service';
import { TaskService } from '../tasks/task.service';
import { InMemoryConversationStore } from './in-memory-conversation.store';

// Internal projections of frozen contracts/conversation.ts (1.0.0).
interface ChatRequest {
  content: string;
  clientMessageId: string;
}

export interface MessageAcceptance {
  messageId: string;
  conversationId: string;
  accepted: true;
  createdTaskIds: string[];
}

export class MessageSubmissionFailure extends Error {
  constructor(readonly code: 'CONVERSATION_NOT_FOUND' | 'INVALID_CHAT_REQUEST') {
    super(code);
  }
}

@Injectable()
export class MessageSubmissionService {
  private readonly accepted = new Map<string, Map<string, MessageAcceptance>>();

  constructor(
    private readonly conversations: InMemoryConversationStore,
    private readonly tasks: TaskService,
    private readonly queue: TaskQueueService,
  ) {}

  submit(
    conversationId: string,
    userId: string,
    authContextId: string,
    body: unknown,
  ): MessageAcceptance {
    const conversation = this.conversations.getById(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new MessageSubmissionFailure('CONVERSATION_NOT_FOUND');
    }
    if (!this.isChatRequest(body)) {
      throw new MessageSubmissionFailure('INVALID_CHAT_REQUEST');
    }

    // No asynchronous yield between lookup, creation, enqueue, and insertion.
    const records = this.accepted.get(conversationId) ?? new Map<string, MessageAcceptance>();
    const existing = records.get(body.clientMessageId);
    if (existing) return this.copy(existing);

    const messageId = randomUUID();
    const correlationId = randomUUID();
    const task = this.tasks.create({
      conversationId,
      agentName: 'SupervisorAgent',
      goal: body.content,
      authContextId,
    }, correlationId);
    this.queue.enqueue(task.id, correlationId);

    const acceptance: MessageAcceptance = {
      messageId,
      conversationId,
      accepted: true,
      createdTaskIds: [task.id],
    };
    records.set(body.clientMessageId, acceptance);
    this.accepted.set(conversationId, records);
    return this.copy(acceptance);
  }

  private isChatRequest(body: unknown): body is ChatRequest {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return false;
    const candidate = body as Partial<ChatRequest>;
    return typeof candidate.content === 'string' && candidate.content.trim().length > 0 &&
      typeof candidate.clientMessageId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.clientMessageId);
  }

  private copy(acceptance: MessageAcceptance): MessageAcceptance {
    return {
      messageId: acceptance.messageId,
      conversationId: acceptance.conversationId,
      accepted: true,
      createdTaskIds: [...acceptance.createdTaskIds],
    };
  }
}
