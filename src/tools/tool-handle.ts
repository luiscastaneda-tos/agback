/**
 * Internal projection of ToolHandle in contracts/agent.ts.
 * The frozen 1.0.0 contract remains authoritative.
 */
export interface ToolHandle {
  name: string;
  description: string;
  /** Callable-free JSON Schema describing accepted arguments. */
  argsSchema: unknown;
}
