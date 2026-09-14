import type { ToolHandle } from '../tools/tool-handle';

/** Data exchanged with a model; no executable references. */
export type LlmJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly LlmJsonValue[]
  | { readonly [key: string]: LlmJsonValue };

/** An intent only. Execution remains the caller's responsibility via ToolInvoker. */
export interface LlmToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: LlmJsonValue;
}

export interface LlmAssistantOutput {
  readonly text: string;
  readonly toolCalls: readonly LlmToolCall[];
}

export interface LlmToolResult {
  readonly toolCallId: string;
  /** Caller-prepared model-safe data, never credentials or runtime context. */
  readonly content: LlmJsonValue;
}

export type LlmMessage =
  | { readonly role: 'system' | 'user'; readonly text: string }
  | ({ readonly role: 'assistant' } & LlmAssistantOutput)
  | ({ readonly role: 'tool' } & LlmToolResult);

/** Internal provider seam, not a public wire contract. */
export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly ToolHandle[];
}

export interface LlmProvider {
  generate(model: string, request: LlmRequest): Promise<LlmAssistantOutput>;
}
