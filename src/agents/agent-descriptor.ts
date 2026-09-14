/**
 * Internal projection of AgentDescriptor in contracts/agent.ts.
 * The frozen 1.0.0 contract is authoritative; keep this shape aligned with it.
 */
export interface AgentDescriptor {
  name: string;
  displayName: string;
  description: string;
  kind: 'supervisor' | 'specialist';
  /** Tool names only. Never executable references. */
  toolNames: string[];
  status: 'idle' | 'busy';
}
