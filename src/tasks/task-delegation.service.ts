import { Injectable } from '@nestjs/common';

import { EventBusService } from '../events/event-bus.service';
import { TaskQueueService } from './task-queue.service';
import { TaskService } from './task.service';

@Injectable()
export class TaskDelegationService {
  constructor(
    private readonly tasks: TaskService,
    private readonly queue: TaskQueueService,
    private readonly eventBus: EventBusService,
  ) {}

  /** Parent and correlation identifiers are supplied by the runtime. */
  delegateHotelSearch(
    parentTaskId: string,
    goal: string,
    correlationId: string,
  ): string {
    if (
      typeof parentTaskId !== 'string' || !parentTaskId.trim() ||
      typeof goal !== 'string' || !goal.trim() ||
      typeof correlationId !== 'string' || !correlationId.trim()
    ) {
      throw new TypeError('Invalid task delegation input.');
    }

    const parent = this.tasks.findById(parentTaskId);
    if (
      parent === undefined ||
      parent.status !== 'running' ||
      parent.agentName !== 'SupervisorAgent'
    ) {
      throw new Error('Task delegation requires a running SupervisorAgent parent.');
    }

    const child = this.tasks.create({
      agentName: 'HotelSearchAgent',
      parentTaskId: parent.id,
      conversationId: parent.conversationId,
      authContextId: parent.authContextId,
      goal,
    }, correlationId);

    this.queue.enqueue(child.id, correlationId);
    this.eventBus.publish({
      type: 'supervisor.delegated',
      conversationId: parent.conversationId,
      taskId: parent.id,
      agentName: 'SupervisorAgent',
      correlationId,
      payload: {
        childTaskId: child.id,
        targetAgentName: 'HotelSearchAgent',
      },
    });

    return child.id;
  }
}
