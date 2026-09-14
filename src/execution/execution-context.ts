/**
 * Ephemeral internal context constructed only by the future ToolInvoker from
 * trusted runtime identity and credentials resolved for authorized execution.
 * Never serialize, log, persist, or expose this context to agents or the LLM.
 */
export interface ExecutionContext {
  readonly conversationId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly accessToken: string;
  /** Unix timestamp in milliseconds, matching ExecutionCredentialResolver. */
  readonly expiresAt: number;
}
