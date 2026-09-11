export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_human_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskResult {
  kind: string;
  data: unknown;
  /** Safe, human-readable. Never chain-of-thought. */
  summary: string;
}

export type TaskFailureCode =
  | 'TOOL_ERROR'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_EXPIRED'
  | 'AUTH_CONTEXT_EXPIRED'
  | 'POLICY_FORBIDDEN'
  | 'CANCELLED';

export interface TaskFailure {
  code: TaskFailureCode;
  /** Sanitized. Never carries upstream internals or credentials. */
  message: string;
}

export interface AgentTask {
  id: string;
  conversationId: string;
  parentTaskId?: string;
  agentName: string;
  /** Operational description of the goal. Never chain-of-thought. */
  goal: string;
  status: TaskStatus;
  /** Opaque handle only; never a token or resolved credential. */
  authContextId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: TaskResult;
  failure?: TaskFailure;
  activeApprovalId?: string;
}

export interface CreateAgentTaskInput {
  conversationId: string;
  parentTaskId?: string;
  agentName: string;
  goal: string;
  authContextId: string;
}

