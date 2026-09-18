import type { ApprovalPreviewField } from '../tools/definitions/tool-definition';

/** Noncanonical internal projection of frozen contracts/approval.ts (1.0.0). */
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'superseded';

/**
 * Noncanonical internal projection; contracts/approval.ts remains authoritative.
 * Future HTTP/SSE adapters must explicitly map to the frozen public shape.
 */
export interface ApprovalRequest {
  id: string;
  conversationId: string;
  taskId: string;
  action: string;
  actionVersion: number;
  requestedByAgent: string;
  status: ApprovalStatus;
  summary: string;
  inputPreview: ApprovalPreviewField[];
  /** Existing material payload hash, bound to this action, conversation and task. */
  payloadHash: string;
  /** Internal-only validated arguments. Explicit HTTP projections must omit this field. */
  validatedArguments: unknown;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  rejectionReason?: string;
}

export interface CreateApprovalRequestInput {
  conversationId: string;
  taskId: string;
  action: string;
  actionVersion: number;
  requestedByAgent: string;
  summary: string;
  /** Per-action allowlist preview, never raw arguments or credentials. */
  inputPreview: readonly ApprovalPreviewField[];
  payloadHash: string;
  /** Exact schema-validated arguments shown for approval; never exposed over HTTP/SSE. */
  validatedArguments: unknown;
}

/** Internal outcome; replacement requires the caller to pause for approval. */
export type SupersedeApprovalOnMismatchResult =
  | {
      kind: 'replaced';
      original: ApprovalRequest;
      replacement: ApprovalRequest;
    }
  | { kind: 'not_replaced' };

/** Internal storage input; HTTP idempotency is handled outside this store. */
export interface RecordApprovalDecisionInput {
  approvalId: string;
  decision: 'approve' | 'reject';
  /** Authenticated deciding user, authorized by the caller as conversation owner. */
  userId: string;
  reason?: string;
}
