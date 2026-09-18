import type { SupervisorAgent, SupervisorAgentOutcome } from '../agents/supervisor/supervisor.agent';
import type { EventBusService } from '../events/event-bus.service';
import type { InMemoryApprovalStore } from '../approvals/in-memory-approval.store';
import type { ConversationMemoryStore } from '../memory/conversation-memory.store';
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
    private readonly eventBus: EventBusService,
    private readonly memory: ConversationMemoryStore,
    private readonly approvals: InMemoryApprovalStore,
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
        correlationId: context.correlationId,
        ...(task.activeApprovalId === undefined
          ? {}
          : { approvalId: task.activeApprovalId }),
      };
      const lifecycle = {
        conversationId: task.conversationId,
        taskId: task.id,
        agentName: 'SupervisorAgent',
        correlationId: context.correlationId,
        payload: {},
      };
      let outcome: SupervisorAgentOutcome;
      this.eventBus.publish({ ...lifecycle, type: 'agent.started' });
      try {
        const approval = task.activeApprovalId === undefined
          ? undefined
          : this.approvals.findById(task.activeApprovalId);
        outcome = approval?.status === 'approved' &&
          approval.taskId === task.id &&
          approval.conversationId === task.conversationId
          ? await this.supervisor.runApprovedAction(
            approval.action,
            approval.validatedArguments,
            toolContext,
          )
          : await this.supervisor.run(
            task.goal,
            toolContext,
            this.memory.getContext(task.conversationId),
          );
      } catch {
        this.eventBus.publish({ ...lifecycle, type: 'agent.failed' });
        return this.failure();
      }
      switch (outcome.kind) {
        case 'completed':
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
              summary: 'Supervisor answered the request.',
            },
          };
        case 'cart_completed':
          this.eventBus.publish({ ...lifecycle, type: 'agent.completed' });
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
        case 'confirmation_completed':
          this.eventBus.publish({ ...lifecycle, type: 'agent.completed' });
          return {
            kind: 'completed',
            result: {
              kind: 'answer',
              data: {
                mock: outcome.data.mock,
                bookingId: outcome.data.bookingId,
                status: outcome.data.status,
              },
              summary: 'Fictional mock booking confirmed after owner approval.',
            },
          };
        case 'cancellation_completed':
          this.eventBus.publish({ ...lifecycle, type: 'agent.completed' });
          return {
            kind: 'completed',
            result: {
              kind: 'answer',
              data: {
                mock: outcome.data.mock,
                bookingId: outcome.data.bookingId,
                status: outcome.data.status,
              },
              summary: 'Fictional mock booking cancelled after owner approval.',
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
                code: 'APPROVAL_REJECTED', message: 'Reservation action was rejected.',
              } };
            case 'forbidden':
              return { kind: 'failed', failure: {
                code: 'POLICY_FORBIDDEN', message: 'Reservation action is forbidden by policy.',
              } };
            default:
              return this.failure();
          }
        case 'delegated': {
          let childTaskId: string;
          try {
            childTaskId = this.delegation.delegateHotelSearch(
              task.id,
              outcome.goal,
              context.correlationId,
            );
          } catch {
            this.eventBus.publish({ ...lifecycle, type: 'agent.failed' });
            return this.failure();
          }
          this.eventBus.publish({ ...lifecycle, type: 'agent.completed' });
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
          this.eventBus.publish({ ...lifecycle, type: 'agent.failed' });
          if (outcome.code === 'AUTH_CONTEXT_EXPIRED') {
            return { kind: 'failed', failure: {
              code: 'AUTH_CONTEXT_EXPIRED',
              message: 'Authentication expired. Authenticate again.',
            } };
          }
          if (outcome.code === 'TOOL_FAILED') {
            return { kind: 'failed', failure: {
              code: 'TOOL_ERROR', message: 'Reservation tool invocation failed.',
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
