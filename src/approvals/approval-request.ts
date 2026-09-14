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
}
