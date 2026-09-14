import { Injectable } from '@nestjs/common';

import { EventBusService } from '../events/event-bus.service';
import {
  AgentTask,
  CreateAgentTaskInput,
  TaskFailure,
  TaskResult,
} from './agent-task';
import { InMemoryTaskStore } from './in-memory-task.store';
import { TaskTransition } from './task-transition';

const CANCELLED_FAILURE: TaskFailure = {
  code: 'CANCELLED',
  message: 'Task was cancelled.',
};

@Injectable()
export class TaskService {
  constructor(
    private readonly store: InMemoryTaskStore,
    private readonly eventBus: EventBusService,
  ) {}

  create(input: CreateAgentTaskInput, correlationId: string): AgentTask {
    const task = this.store.create(structuredClone(input));
    this.publish(task, 'task.created', correlationId);
    this.publish(task, 'task.queued', correlationId);
    return structuredClone(task);
  }

  findById(taskId: string): AgentTask | undefined {
    return this.store.findById(taskId);
  }

  listByConversation(conversationId: string): AgentTask[] {
    return this.store.listByConversation(conversationId);
  }

  start(taskId: string, correlationId: string): AgentTask {
    return this.commit(taskId, { status: 'running' }, correlationId);
  }

  pauseForApproval(
    taskId: string,
    activeApprovalId: string,
    correlationId: string,
  ): AgentTask {
    const task = this.commit(
      taskId,
      { status: 'awaiting_human_approval', activeApprovalId },
      correlationId,
    );
    this.eventBus.publish({
      type: 'approval.requested',
      conversationId: task.conversationId,
      taskId: task.id,
      agentName: task.agentName,
      correlationId,
      payload: { approvalId: activeApprovalId, status: 'pending' },
    });
    return task;
  }

  requeue(taskId: string, correlationId: string): AgentTask {
    return this.commit(taskId, { status: 'queued' }, correlationId);
  }

  /** Internal compare-and-clear operation for the approval execution boundary. */
  clearActiveApproval(taskId: string, expectedApprovalId: string): boolean {
    return this.store.clearActiveApproval(taskId, expectedApprovalId);
  }

  complete(
    taskId: string,
    result: TaskResult,
    correlationId: string,
  ): AgentTask {
    return this.commit(
      taskId,
      { status: 'completed', result: structuredClone(result) },
      correlationId,
    );
  }

  fail(
    taskId: string,
    failure: TaskFailure,
    correlationId: string,
  ): AgentTask {
    return this.commit(
      taskId,
      { status: 'failed', failure: structuredClone(failure) },
      correlationId,
    );
  }

  cancel(taskId: string, correlationId: string): AgentTask {
    return this.commit(
      taskId,
      { status: 'cancelled', failure: CANCELLED_FAILURE },
      correlationId,
    );
  }

  private commit(
    taskId: string,
    transition: TaskTransition,
    correlationId: string,
  ): AgentTask {
    const task = this.store.transition(taskId, structuredClone(transition));
    const eventType =
      transition.status === 'running'
        ? 'task.started'
        : transition.status === 'queued'
          ? 'task.queued'
          : transition.status === 'completed'
            ? 'task.completed'
            : transition.status === 'failed'
              ? 'task.failed'
              : transition.status === 'cancelled'
                ? 'task.cancelled'
                : undefined;

    if (eventType !== undefined) {
      this.publish(task, eventType, correlationId);
    }
    return structuredClone(task);
  }

  private publish(
    task: AgentTask,
    type:
      | 'task.created'
      | 'task.queued'
      | 'task.started'
      | 'task.completed'
      | 'task.failed'
      | 'task.cancelled',
    correlationId: string,
  ): void {
    this.eventBus.publish({
      type,
      conversationId: task.conversationId,
      taskId: task.id,
      agentName: task.agentName,
      correlationId,
      payload: { status: task.status },
    });
  }
}

