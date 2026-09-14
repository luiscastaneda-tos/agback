import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { AuthContextService } from '../auth/auth-context.service';
import type { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import type { TaskQueueService } from '../tasks/task-queue.service';
import type { TaskService } from '../tasks/task.service';
import type { ApprovalRequest } from './approval-request';
import type { InMemoryApprovalStore } from './in-memory-approval.store';

/** Noncanonical internal projection of frozen contracts/approval.ts (1.0.0). */
export interface ApprovalDecision {
  decision: 'approve' | 'reject';
  reason?: string;
  idempotencyKey: string;
}

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

export class ApprovalDecisionFailure extends Error {
  constructor(
    readonly code: 'INVALID_APPROVAL_DECISION' | 'APPROVAL_UNAVAILABLE',
  ) {
    super(code === 'INVALID_APPROVAL_DECISION'
      ? 'Invalid approval decision.'
      : 'Approval unavailable.');
  }
}

/** Process-local application service; recording a decision never executes it. */
export class ApprovalDecisionService {
  private readonly results = new Map<string, ApprovalRequest>();

  constructor(
    private readonly approvals: InMemoryApprovalStore,
    private readonly conversations: InMemoryConversationStore,
    private readonly authContexts: AuthContextService,
    private readonly tasks: TaskService,
    private readonly queue: TaskQueueService,
  ) {}

  recordDecision(
    authContextId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): ApprovalRequest {
    const { userId } = this.authContexts.lookup(authContextId);
    const parsed = decisionSchema.safeParse(decision);
    if (!parsed.success) {
      throw new ApprovalDecisionFailure('INVALID_APPROVAL_DECISION');
    }

    const approval = this.approvals.findById(approvalId);
    const conversation = approval === undefined
      ? undefined
      : this.conversations.getById(approval.conversationId);
    if (conversation === undefined || conversation.userId !== userId) {
      throw new ApprovalDecisionFailure('APPROVAL_UNAVAILABLE');
    }

    // Tuple encoding avoids collisions; every replay rechecks active ownership.
    const key = JSON.stringify([userId, approvalId, parsed.data.idempotencyKey]);
    const cached = this.results.get(key);
    if (cached !== undefined) {
      this.reconcileApproval(approvalId, userId);
      return structuredClone(cached);
    }

    // The store owns expiry, non-pending no-ops and decision audit metadata.
    // No asynchronous yield separates authorization, mutation and caching.
    const result = this.approvals.recordDecision({
      approvalId,
      decision: parsed.data.decision,
      userId,
      ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
    });
    if (result === undefined) {
      throw new ApprovalDecisionFailure('APPROVAL_UNAVAILABLE');
    }

    this.results.set(key, structuredClone(result));
    this.reconcileApproval(approvalId, userId);
    return structuredClone(result);
  }

  private reconcileApproval(approvalId: string, userId: string): void {
    // Reconcile current storage state, never the cached decision snapshot.
    const approval = this.approvals.findById(approvalId);
    if (approval === undefined) return;

    const expired = approval.status === 'expired' || (
      approval.status === 'approved' &&
      Date.parse(approval.expiresAt) <= Date.now()
    );

    const task = this.tasks.findById(approval.taskId);
    if (
      task === undefined ||
      task.id !== approval.taskId ||
      task.conversationId !== approval.conversationId ||
      task.status !== 'awaiting_human_approval' ||
      task.activeApprovalId !== approval.id
    ) {
      return;
    }

    if (!expired && approval.status === 'approved') {
      if (
        approval.resolvedBy !== userId ||
        !(Date.parse(approval.expiresAt) > Date.now()) ||
        this.approvals.isConsumed(approval.id)
      ) return;

      // Synchronous transition is the single-winner gate, including replays.
      const correlationId = randomUUID();
      this.tasks.requeue(task.id, correlationId);
      this.queue.enqueue(task.id, correlationId);
      return;
    }
    if (approval.status !== 'rejected' && !expired) return;

    this.tasks.fail(
      task.id,
      expired
        ? { code: 'APPROVAL_EXPIRED', message: 'Approval has expired.' }
        : { code: 'APPROVAL_REJECTED', message: 'Approval was rejected.' },
      randomUUID(),
    );
  }
}
