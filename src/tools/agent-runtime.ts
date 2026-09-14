/** Supplied by trusted runtime code, never populated from model arguments. */
export interface ToolContext {
  readonly conversationId: string;
  readonly taskId: string;
  /** Trusted reference to a previously requested approval. */
  readonly approvalId?: string;
}

export type ToolOutcome =
  | { kind: 'completed'; data: unknown }
  | { kind: 'awaiting_approval'; approvalId: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'forbidden'; reason: string };

export interface AgentRuntime {
  invoke(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}
