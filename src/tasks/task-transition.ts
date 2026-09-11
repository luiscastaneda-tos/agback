import { TaskFailure, TaskResult, TaskStatus } from './agent-task';

export type TaskTransition =
  | { status: 'running' }
  | { status: 'awaiting_human_approval'; activeApprovalId: string }
  | { status: 'queued' }
  | { status: 'completed'; result: TaskResult }
  | { status: 'failed'; failure: TaskFailure }
  | { status: 'cancelled'; failure: TaskFailure };

const LEGAL_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['awaiting_human_approval', 'completed', 'failed', 'cancelled'],
  awaiting_human_approval: ['queued', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function assertLegalTaskTransition(
  current: TaskStatus,
  next: TaskStatus,
): void {
  if (!LEGAL_TRANSITIONS[current].includes(next)) {
    throw new Error(`Illegal task status transition: ${current} -> ${next}`);
  }
}

