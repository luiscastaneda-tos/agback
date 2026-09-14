import { Module } from '@nestjs/common';

import { AuthContextService } from '../auth/auth-context.service';
import { AuthModule } from '../auth/auth.module';
import { loadRuntimeConfig } from '../config/runtime-config';
import { ConversationModule } from '../conversations/conversation.module';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import { TaskModule } from '../tasks/task.module';
import { TaskService } from '../tasks/task.service';
import { ApprovalDecisionService } from './approval-decision.service';
import { InMemoryApprovalStore } from './in-memory-approval.store';

@Module({
  imports: [AuthModule, ConversationModule, TaskModule],
  providers: [
    {
      provide: InMemoryApprovalStore,
      useFactory: () => new InMemoryApprovalStore(loadRuntimeConfig()),
    },
    {
      provide: ApprovalDecisionService,
      inject: [InMemoryApprovalStore, InMemoryConversationStore, AuthContextService, TaskService],
      useFactory: (
        approvals: InMemoryApprovalStore,
        conversations: InMemoryConversationStore,
        authContexts: AuthContextService,
        tasks: TaskService,
      ) => new ApprovalDecisionService(approvals, conversations, authContexts, tasks),
    },
  ],
  exports: [InMemoryApprovalStore, ApprovalDecisionService],
})
export class ApprovalModule {}
