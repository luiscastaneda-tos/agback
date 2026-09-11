export type AgentEventType =
  | 'conversation.message.received'
  | 'conversation.state.updated'
  | 'supervisor.started'
  | 'supervisor.delegated'
  | 'supervisor.result.received'
  | 'task.created'
  | 'task.queued'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'tool.called'
  | 'tool.completed'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'approval.expired'
  | 'approval.superseded';

export interface AgentEvent<TPayload = unknown> {
  id: string;
  seq: number;
  type: AgentEventType;
  conversationId: string;
  taskId?: string;
  agentName?: string;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
}

export type PublishAgentEvent<TPayload = unknown> = Omit<
  AgentEvent<TPayload>,
  'id' | 'seq' | 'occurredAt'
>;

