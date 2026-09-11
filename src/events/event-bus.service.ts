import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AgentEvent, PublishAgentEvent } from './agent-event';
import { redactEventPayload } from './event-redactor';

export const DEFAULT_EVENT_BUFFER_CAPACITY = 100;

export type EventSubscriber = (event: AgentEvent) => void;
export type Unsubscribe = () => void;

@Injectable()
export class EventBusService {
  private readonly buffers = new Map<string, AgentEvent[]>();
  private readonly nextSequences = new Map<string, number>();
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();

  constructor(
    private readonly capacity: number = DEFAULT_EVENT_BUFFER_CAPACITY,
  ) {
    if (
      !Number.isFinite(capacity) ||
      !Number.isInteger(capacity) ||
      capacity <= 0
    ) {
      throw new RangeError('Event buffer capacity must be a finite positive integer');
    }
  }

  publish<TPayload>(input: PublishAgentEvent<TPayload>): AgentEvent<TPayload> {
    const sanitizedPayload = redactEventPayload(input.type, input.payload);
    const seq = this.nextSequences.get(input.conversationId) ?? 1;
    const event: AgentEvent<TPayload> = {
      id: randomUUID(),
      seq,
      type: input.type,
      conversationId: input.conversationId,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.agentName === undefined ? {} : { agentName: input.agentName }),
      correlationId: input.correlationId,
      occurredAt: new Date().toISOString(),
      payload: sanitizedPayload,
    };

    this.nextSequences.set(input.conversationId, seq + 1);

    const buffer = this.buffers.get(input.conversationId) ?? [];
    buffer.push(event);
    if (buffer.length > this.capacity) {
      buffer.splice(0, buffer.length - this.capacity);
    }
    this.buffers.set(input.conversationId, buffer);

    const conversationSubscribers = this.subscribers.get(input.conversationId);
    if (conversationSubscribers !== undefined) {
      for (const subscriber of [...conversationSubscribers]) {
        subscriber(this.clone(event));
      }
    }

    return this.clone(event);
  }

  replay(conversationId: string, lastSeenSeq?: number): AgentEvent[] {
    const events = this.buffers.get(conversationId) ?? [];
    const minimumSeq = lastSeenSeq ?? 0;

    return events
      .filter((event) => event.seq > minimumSeq)
      .map((event) => this.clone(event));
  }

  subscribe(
    conversationId: string,
    subscriber: EventSubscriber,
  ): Unsubscribe {
    const conversationSubscribers =
      this.subscribers.get(conversationId) ?? new Set<EventSubscriber>();
    conversationSubscribers.add(subscriber);
    this.subscribers.set(conversationId, conversationSubscribers);

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      conversationSubscribers.delete(subscriber);
      if (conversationSubscribers.size === 0) {
        this.subscribers.delete(conversationId);
      }
    };
  }

  private clone<TPayload>(event: AgentEvent<TPayload>): AgentEvent<TPayload> {
    return structuredClone(event);
  }
}
