import { randomUUID } from 'node:crypto';

import type { RuntimeConfig } from '../config/runtime-config';
import type { ApprovalRequest, CreateApprovalRequestInput } from './approval-request';

/** Process-local creation and reads only; this store grants no execution authority. */
export class InMemoryApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly approvalTtlMs: number;

  constructor(config: Pick<RuntimeConfig, 'approvalTtlMs'>) {
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
      createdAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const stored = structuredClone(request);
    this.requests.set(stored.id, stored);
    return this.read(stored);
  }

  findById(id: string): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    return request === undefined ? undefined : this.read(request);
  }

  listByConversation(conversationId: string): ApprovalRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.conversationId === conversationId)
      .map((request) => this.read(request));
  }

  private read(request: ApprovalRequest): ApprovalRequest {
    if (request.status === 'pending' && Date.parse(request.expiresAt) <= Date.now()) {
      request.status = 'expired';
    }
    return structuredClone(request);
  }
}
