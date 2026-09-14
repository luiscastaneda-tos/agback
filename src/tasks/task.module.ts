import { Module } from '@nestjs/common';

import { EventModule } from '../events/event.module';
import { InMemoryTaskStore } from './in-memory-task.store';
import { TaskDelegationService } from './task-delegation.service';
import { TaskProcessorRegistry } from './task-processor';
import { TaskQueueService } from './task-queue.service';
import { TaskService } from './task.service';

@Module({
  imports: [EventModule],
  providers: [
    InMemoryTaskStore,
    TaskProcessorRegistry,
    TaskService,
    TaskQueueService,
    TaskDelegationService,
  ],
  exports: [TaskProcessorRegistry, TaskService, TaskQueueService, TaskDelegationService],
})
export class TaskModule {}
