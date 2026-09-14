import { Module } from '@nestjs/common';

import { AuthContextService } from '../auth/auth-context.service';
import { AuthModule } from '../auth/auth.module';
import { loadRuntimeConfig } from '../config/runtime-config';
import { ConversationModule } from '../conversations/conversation.module';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import { ApprovalDecisionService } from './approval-decision.service';
import { InMemoryApprovalStore } from './in-memory-approval.store';

@Module({
  imports: [AuthModule, ConversationModule],
  providers: [
    {
      provide: InMemoryApprovalStore,
      useFactory: () => new InMemoryApprovalStore(loadRuntimeConfig()),
    },
    {
      provide: ApprovalDecisionService,
      inject: [InMemoryApprovalStore, InMemoryConversationStore, AuthContextService],
      useFactory: (
        approvals: InMemoryApprovalStore,
        conversations: InMemoryConversationStore,
        authContexts: AuthContextService,
      ) => new ApprovalDecisionService(approvals, conversations, authContexts),
    },
  ],
  exports: [InMemoryApprovalStore, ApprovalDecisionService],
})
export class ApprovalModule {}
