import { Injectable } from '@nestjs/common';

import { TaskFailure, TaskFailureCode } from './agent-task';
import {
  TaskProcessorOutcome,
  TaskProcessorRegistry,
} from './task-processor';
import { TaskService } from './task.service';

interface QueueEntry {
  taskId: string;
  correlationId: string;
}

const MISSING_PROCESSOR_FAILURE: TaskFailure = {
  code: 'UPSTREAM_ERROR',
  message: 'No task processor is available for this agent.',
};

const PROCESSOR_FAILURE: TaskFailure = {
  code: 'UPSTREAM_ERROR',
  message: 'Task processing failed.',
};

const FAILURE_CODES = new Set<TaskFailureCode>([
  'TOOL_ERROR',
  'UPSTREAM_ERROR',
  'TIMEOUT',
  'APPROVAL_REJECTED',
  'APPROVAL_EXPIRED',
  'AUTH_CONTEXT_EXPIRED',
  'POLICY_FORBIDDEN',
  'CANCELLED',
]);

@Injectable()
export class TaskQueueService {
  private readonly queue: QueueEntry[] = [];
  private readonly scheduledTaskIds = new Set<string>();
  private draining = false;
  private drainScheduled = false;

  constructor(
    private readonly tasks: TaskService,
    private readonly processors: TaskProcessorRegistry,
  ) {}

  enqueue(taskId: string, correlationId: string): void {
    const task = this.tasks.findById(taskId);
    if (task === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (task.status !== 'queued') {
      throw new Error(`Only queued tasks may be enqueued: ${taskId}`);
    }
    if (this.scheduledTaskIds.has(taskId)) {
      return;
    }

    this.scheduledTaskIds.add(taskId);
    this.queue.push({ taskId, correlationId });
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.draining || this.drainScheduled) {
      return;
    }

    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      let entry: QueueEntry | undefined;
      while ((entry = this.queue.shift()) !== undefined) {
        try {
          await this.process(entry);
        } finally {
          this.scheduledTaskIds.delete(entry.taskId);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        this.scheduleDrain();
      }
    }
  }

  private async process(entry: QueueEntry): Promise<void> {
    const queuedTask = this.tasks.findById(entry.taskId);
    if (queuedTask === undefined || queuedTask.status !== 'queued') {
      return;
    }

    const runningTask = this.tasks.start(entry.taskId, entry.correlationId);
    const processor = this.processors.resolve(runningTask.agentName);
    if (processor === undefined) {
      this.failIfRunning(entry, MISSING_PROCESSOR_FAILURE);
      return;
    }

    try {
      const outcome: unknown = await processor.process(
        structuredClone(runningTask),
        { correlationId: entry.correlationId },
      );
      this.applyOutcome(entry, outcome);
    } catch {
      this.failIfRunning(entry, PROCESSOR_FAILURE);
    }
  }

  private applyOutcome(entry: QueueEntry, outcome: unknown): void {
    if (!this.isStillRunning(entry.taskId)) {
      return;
    }
    if (outcome === null || typeof outcome !== 'object') {
      throw new TypeError('Invalid task processor outcome');
    }

    const candidate = outcome as Partial<TaskProcessorOutcome>;
    if (
      candidate.kind === 'completed' &&
      candidate.result !== null &&
      typeof candidate.result === 'object' &&
      typeof candidate.result.kind === 'string' &&
      typeof candidate.result.summary === 'string' &&
      'data' in candidate.result
    ) {
      this.tasks.complete(
        entry.taskId,
        structuredClone(candidate.result),
        entry.correlationId,
      );
      return;
    }
    if (
      candidate.kind === 'awaiting_human_approval' &&
      typeof candidate.activeApprovalId === 'string'
    ) {
      this.tasks.pauseForApproval(
        entry.taskId,
        candidate.activeApprovalId,
        entry.correlationId,
      );
      return;
    }
    if (
      candidate.kind === 'failed' &&
      candidate.failure !== null &&
      typeof candidate.failure === 'object' &&
      typeof candidate.failure.code === 'string' &&
      FAILURE_CODES.has(candidate.failure.code as TaskFailureCode) &&
      typeof candidate.failure.message === 'string'
    ) {
      this.tasks.fail(
        entry.taskId,
        structuredClone(candidate.failure),
        entry.correlationId,
      );
      return;
    }

    throw new TypeError('Invalid task processor outcome');
  }

  private failIfRunning(entry: QueueEntry, failure: TaskFailure): void {
    if (this.isStillRunning(entry.taskId)) {
      this.tasks.fail(entry.taskId, failure, entry.correlationId);
    }
  }

  private isStillRunning(taskId: string): boolean {
    return this.tasks.findById(taskId)?.status === 'running';
  }
}
