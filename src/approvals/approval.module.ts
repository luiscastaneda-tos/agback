import { Module } from '@nestjs/common';

import { AuthContextService } from '../auth/auth-context.service';
import { AuthModule } from '../auth/auth.module';
import { loadRuntimeConfig } from '../config/runtime-config';
import { ConversationModule } from '../conversations/conversation.module';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import { EventBusService } from '../events/event-bus.service';
import { EventModule } from '../events/event.module';
import { TaskModule } from '../tasks/task.module';
import { TaskQueueService } from '../tasks/task-queue.service';
import { TaskService } from '../tasks/task.service';
import { ApprovalDecisionService } from './approval-decision.service';
import { InMemoryApprovalStore } from './in-memory-approval.store';

@Module({
  imports: [AuthModule, ConversationModule, TaskModule, EventModule],
  providers: [
    {
      provide: InMemoryApprovalStore,
      inject: [EventBusService],
      useFactory: (eventBus: EventBusService) =>
        new InMemoryApprovalStore(loadRuntimeConfig(), eventBus),
    },
    {
      provide: ApprovalDecisionService,
      inject: [InMemoryApprovalStore, InMemoryConversationStore, AuthContextService, TaskService, TaskQueueService, EventBusService],
      useFactory: (
        approvals: InMemoryApprovalStore,
        conversations: InMemoryConversationStore,
        authContexts: AuthContextService,
        tasks: TaskService,
        queue: TaskQueueService,
        eventBus: EventBusService,
      ) => new ApprovalDecisionService(approvals, conversations, authContexts, tasks, queue, eventBus),
    },
  ],
  exports: [InMemoryApprovalStore, ApprovalDecisionService],
})
export class ApprovalModule {}
