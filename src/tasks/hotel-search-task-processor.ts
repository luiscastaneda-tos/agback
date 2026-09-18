import type { HotelSearchAgent, HotelSearchAgentOutcome } from '../agents/hotel-search/hotel-search.agent';
import type { EventBusService } from '../events/event-bus.service';
import type { ConversationMemoryStore } from '../memory/conversation-memory.store';
import type { ToolContext } from '../tools/agent-runtime';
import type { AgentTask } from './agent-task';
import type {
  TaskProcessor,
  TaskProcessorContext,
  TaskProcessorOutcome,
} from './task-processor';

export class HotelSearchTaskProcessor implements TaskProcessor {
  constructor(
    private readonly hotelSearch: HotelSearchAgent,
    private readonly eventBus: EventBusService,
    private readonly memory: ConversationMemoryStore,
  ) {}

  async process(
    task: AgentTask,
    context: TaskProcessorContext,
  ): Promise<TaskProcessorOutcome> {
    try {
      if (
        task.agentName !== 'HotelSearchAgent' ||
        task.status !== 'running' ||
        typeof task.id !== 'string' || !task.id.trim() ||
        typeof task.conversationId !== 'string' || !task.conversationId.trim() ||
        typeof context.correlationId !== 'string' || !context.correlationId.trim()
      ) {
        return this.failure();
      }

      const toolContext: ToolContext = {
        taskId: task.id,
        conversationId: task.conversationId,
        correlationId: context.correlationId,
        ...(task.activeApprovalId === undefined
          ? {}
          : { approvalId: task.activeApprovalId }),
      };
      const lifecycle = {
        conversationId: task.conversationId,
        taskId: task.id,
        agentName: 'HotelSearchAgent',
        correlationId: context.correlationId,
        payload: {},
      };
      let outcome: HotelSearchAgentOutcome;
      this.eventBus.publish({ ...lifecycle, type: 'agent.started' });
      try {
        outcome = await this.hotelSearch.run(task.goal, toolContext);
      } catch {
        this.eventBus.publish({ ...lifecycle, type: 'agent.failed' });
        return this.failure();
      }
      switch (outcome.kind) {
        case 'completed':
          if (outcome.hotelSearch !== undefined) {
            this.memory.setLastHotelSearch(task.conversationId, outcome.hotelSearch);
          }
          this.memory.appendMessage(task.conversationId, {
            role: 'assistant',
            text: outcome.text,
          });
          this.eventBus.publish({ ...lifecycle, type: 'agent.completed' });
          return {
            kind: 'completed',
            result: {
              kind: 'answer',
              data: { text: outcome.text },
              summary: 'HotelSearchAgent provided fictional mock hotel assistance.',
            },
          };
        case 'stopped':
          switch (outcome.outcome.kind) {
            case 'awaiting_approval':
              return {
                kind: 'awaiting_human_approval',
                activeApprovalId: outcome.outcome.approvalId,
              };
            case 'rejected':
              return {
                kind: 'failed',
                failure: {
                  code: 'APPROVAL_REJECTED',
                  message: 'Hotel search approval was rejected.',
                },
              };
            case 'forbidden':
              return {
                kind: 'failed',
                failure: {
                  code: 'POLICY_FORBIDDEN',
                  message: 'Hotel search action is forbidden by policy.',
                },
              };
            default:
              return this.failure();
          }
        case 'failed':
          this.eventBus.publish({ ...lifecycle, type: 'agent.failed' });
          if (outcome.code === 'AUTH_CONTEXT_EXPIRED') {
            return {
              kind: 'failed',
              failure: {
                code: 'AUTH_CONTEXT_EXPIRED',
                message: 'Authentication expired. Authenticate again.',
              },
            };
          }
          return this.failure();
        default:
          return this.failure();
      }
    } catch {
      return this.failure();
    }
  }

  private failure(): TaskProcessorOutcome {
    return {
      kind: 'failed',
      failure: {
        code: 'UPSTREAM_ERROR',
        message: 'Hotel search task processing failed.',
      },
    };
  }
}
