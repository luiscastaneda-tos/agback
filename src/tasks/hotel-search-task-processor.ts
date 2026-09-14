import type { HotelSearchAgent } from '../agents/hotel-search/hotel-search.agent';
import type { ToolContext } from '../tools/agent-runtime';
import type { AgentTask } from './agent-task';
import type {
  TaskProcessor,
  TaskProcessorContext,
  TaskProcessorOutcome,
} from './task-processor';

export class HotelSearchTaskProcessor implements TaskProcessor {
  constructor(private readonly hotelSearch: HotelSearchAgent) {}

  async process(
    task: AgentTask,
    _context: TaskProcessorContext,
  ): Promise<TaskProcessorOutcome> {
    try {
      if (
        task.agentName !== 'HotelSearchAgent' ||
        task.status !== 'running' ||
        typeof task.id !== 'string' || !task.id.trim() ||
        typeof task.conversationId !== 'string' || !task.conversationId.trim()
      ) {
        return this.failure();
      }

      const toolContext: ToolContext = {
        taskId: task.id,
        conversationId: task.conversationId,
        ...(task.activeApprovalId === undefined
          ? {}
          : { approvalId: task.activeApprovalId }),
      };
      const outcome = await this.hotelSearch.run(task.goal, toolContext);
      switch (outcome.kind) {
        case 'completed':
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
