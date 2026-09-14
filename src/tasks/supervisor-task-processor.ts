import type { SupervisorAgent } from '../agents/supervisor/supervisor.agent';
import type { ToolContext } from '../tools/agent-runtime';
import type { AgentTask } from './agent-task';
import type { TaskDelegationService } from './task-delegation.service';
import type {
  TaskProcessor,
  TaskProcessorContext,
  TaskProcessorOutcome,
} from './task-processor';

export class SupervisorTaskProcessor implements TaskProcessor {
  constructor(
    private readonly supervisor: SupervisorAgent,
    private readonly delegation: TaskDelegationService,
  ) {}

  async process(
    task: AgentTask,
    context: TaskProcessorContext,
  ): Promise<TaskProcessorOutcome> {
    try {
      if (
        task.agentName !== 'SupervisorAgent' ||
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
        ...(task.activeApprovalId === undefined
          ? {}
          : { approvalId: task.activeApprovalId }),
      };
      const outcome = await this.supervisor.run(task.goal, toolContext);
      switch (outcome.kind) {
        case 'completed':
          return {
            kind: 'completed',
            result: {
              kind: 'answer',
              data: { text: outcome.text },
              summary: 'Supervisor answered the request.',
            },
          };
        case 'cart_completed':
          return {
            kind: 'completed',
            result: {
              kind: 'answer',
              data: {
                mock: outcome.data.mock,
                cartItemId: outcome.data.cartItemId,
                status: outcome.data.status,
              },
              summary: 'Fictional mock reservation added to the cart after owner approval.',
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
              return { kind: 'failed', failure: {
                code: 'APPROVAL_REJECTED', message: 'Cart action was rejected.',
              } };
            case 'forbidden':
              return { kind: 'failed', failure: {
                code: 'POLICY_FORBIDDEN', message: 'Cart action is forbidden by policy.',
              } };
            default:
              return this.failure();
          }
        case 'delegated': {
          const childTaskId = this.delegation.delegateHotelSearch(
            task.id,
            outcome.goal,
            context.correlationId,
          );
          return {
            kind: 'completed',
            result: {
              kind: 'delegated',
              data: { childTaskId },
              summary: 'Fictional mock hotel search queued with HotelSearchAgent.',
            },
          };
        }
        case 'failed':
          if (outcome.code === 'AUTH_CONTEXT_EXPIRED') {
            return { kind: 'failed', failure: {
              code: 'AUTH_CONTEXT_EXPIRED',
              message: 'Authentication expired. Authenticate again.',
            } };
          }
          if (outcome.code === 'TOOL_FAILED') {
            return { kind: 'failed', failure: {
              code: 'TOOL_ERROR', message: 'Cart invocation failed.',
            } };
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
        message: 'Supervisor task processing failed.',
      },
    };
  }
}
