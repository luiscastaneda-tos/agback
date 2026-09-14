import type { ZodType } from 'zod';

/**
 * Internal projection of ApprovalPreviewField in contracts/approval.ts.
 * The frozen 1.0.0 contract remains authoritative.
 */
export interface ApprovalPreviewField {
  label: string;
  value: string;
  emphasis?: 'normal' | 'warning';
}

/** Internal metadata only; possessing a definition grants no execution capability. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** Use Zod's immutable schema APIs; schema utilities must be pure. */
  argsSchema: ZodType;
  actionVersion: number;
  materialFields: readonly string[];
  /** Pure per-action allowlist mapper; never serialize raw arguments. */
  toPreview: (args: unknown) => ApprovalPreviewField[];
  executorKey: string;
}
