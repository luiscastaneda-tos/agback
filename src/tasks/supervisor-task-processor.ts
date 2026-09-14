import type { SupervisorAgent } from '../agents/supervisor/supervisor.agent';
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
        typeof context.correlationId !== 'string' || !context.correlationId.trim()
      ) {
        return this.failure();
      }

      const outcome = await this.supervisor.run(task.goal);
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
