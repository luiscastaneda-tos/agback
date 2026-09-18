import { randomUUID } from 'node:crypto';

import type { RuntimeConfig } from '../config/runtime-config';
import type { EventBusService } from '../events/event-bus.service';
import type {
  ApprovalRequest,
  CreateApprovalRequestInput,
  RecordApprovalDecisionInput,
  SupersedeApprovalOnMismatchResult,
} from './approval-request';

/** Process-local approval storage; this store grants no execution authority. */
export class InMemoryApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly consumedApprovalIds = new Set<string>();
  private readonly approvalTtlMs: number;

  constructor(
    config: Pick<RuntimeConfig, 'approvalTtlMs'>,
    private readonly eventBus: EventBusService,
  ) {
    const ttl = config.approvalTtlMs;
    if (
      !Number.isSafeInteger(ttl) ||
      ttl <= 0 ||
      !Number.isFinite(new Date(Date.now() + ttl).getTime())
    ) {
      throw new Error('Invalid approval TTL.');
    }
    this.approvalTtlMs = ttl;
  }

  create(input: CreateApprovalRequestInput): ApprovalRequest {
    const stored = this.prepareRequest(input);
    const snapshot = structuredClone(stored);
    this.requests.set(stored.id, stored);
    return snapshot;
  }

  private prepareRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    const now = Date.now();
    const expiresAt = new Date(now + this.approvalTtlMs);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new Error('Invalid approval expiry.');
    }

    // Explicit projection excludes extra caller fields, including resolution data.
    const request: ApprovalRequest = {
      id: randomUUID(),
      conversationId: input.conversationId,
      taskId: input.taskId,
      action: input.action,
      actionVersion: input.actionVersion,
      requestedByAgent: input.requestedByAgent,
      status: 'pending',
      summary: input.summary,
      inputPreview: input.inputPreview.map((field) => ({
        label: field.label,
        value: field.value,
        ...(field.emphasis === undefined ? {} : { emphasis: field.emphasis }),
      })),
      payloadHash: input.payloadHash,
      validatedArguments: structuredClone(input.validatedArguments),
      createdAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return structuredClone(request);
  }

  findById(id: string): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    return request === undefined ? undefined : this.read(request);
  }

  /** Internal read-only consumption state; never part of public snapshots. */
  isConsumed(approvalId: string): boolean {
    return this.consumedApprovalIds.has(approvalId);
  }

  listByConversation(conversationId: string): ApprovalRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.conversationId === conversationId)
      .map((request) => this.read(request));
  }

  /**
   * Internal storage operation requiring prior conversation-owner authorization
   * by the caller. Recording a decision does not authorize execution.
   */
  recordDecision(input: RecordApprovalDecisionInput): ApprovalRequest | undefined {
    const request = this.requests.get(input.approvalId);
    if (request === undefined) return undefined;

    const now = Date.now();
    this.expirePending(request, now);
    if (request.status === 'pending') {
      request.status = input.decision === 'approve' ? 'approved' : 'rejected';
      request.resolvedAt = new Date(now).toISOString();
      request.resolvedBy = input.userId;
      if (input.decision === 'reject' && input.reason !== undefined) {
        request.rejectionReason = input.reason;
      }
    }
    return structuredClone(request);
  }

  /**
   * Internal operation for the trusted invoker's expected payload hash.
   * Returns true only for the first eligible consumption; grants no capability.
   * Checks and recording are synchronous, with no yield between them.
   */
  consume(approvalId: string, expectedPayloadHash: string): boolean {
    const request = this.requests.get(approvalId);
    if (
      request === undefined ||
      request.status !== 'approved' ||
      request.payloadHash !== expectedPayloadHash ||
      !(Date.parse(request.expiresAt) > Date.now()) ||
      this.consumedApprovalIds.has(approvalId)
    ) {
      return false;
    }

    this.consumedApprovalIds.add(approvalId);
    return true;
  }

  /**
   * Accepts a trusted, already-computed replacement hash without recomputing it.
   * Preparation and detached snapshots precede the synchronous transition.
   * No decision metadata is changed and no execution authority is granted.
   */
  supersedeOnMismatch(
    approvalId: string,
    input: CreateApprovalRequestInput,
  ): SupersedeApprovalOnMismatchResult {
    const original = this.requests.get(approvalId);
    if (
      original === undefined ||
      (original.status !== 'pending' && original.status !== 'approved') ||
      !(Date.parse(original.expiresAt) > Date.now()) ||
      this.consumedApprovalIds.has(approvalId) ||
      original.payloadHash === input.payloadHash ||
      original.conversationId !== input.conversationId ||
      original.taskId !== input.taskId
    ) {
      return { kind: 'not_replaced' };
    }

    const replacement = this.prepareRequest(input);
    const result: SupersedeApprovalOnMismatchResult = {
      kind: 'replaced',
      original: structuredClone({ ...original, status: 'superseded' }),
      replacement: structuredClone(replacement),
    };

    original.status = 'superseded';
    this.requests.set(replacement.id, replacement);
    return result;
  }

  private read(request: ApprovalRequest): ApprovalRequest {
    this.expirePending(request, Date.now());
    return structuredClone(request);
  }

  private expirePending(request: ApprovalRequest, now: number): void {
    if (request.status === 'pending' && Date.parse(request.expiresAt) <= now) {
      request.status = 'expired';
      this.eventBus.publish({
        type: 'approval.expired',
        conversationId: request.conversationId,
        taskId: request.taskId,
        correlationId: randomUUID(),
        payload: {
          approvalId: request.id,
          status: request.status,
          action: request.action,
        },
      });
    }
  }
}
