import { Module } from '@nestjs/common';

import { ApprovalModule } from '../approvals/approval.module';
import { InMemoryApprovalStore } from '../approvals/in-memory-approval.store';
import { AuthContextService, ExecutionCredentialResolver } from '../auth/auth-context.service';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversations/conversation.module';
import { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import { EventBusService } from '../events/event-bus.service';
import { EventModule } from '../events/event.module';
import { PolicyEngine } from '../policy/policy-engine';
import { TaskModule } from '../tasks/task.module';
import { TaskService } from '../tasks/task.service';
import { createToolInvoker, ToolInvoker } from './tool-invoker';
import { ToolRegistry } from './tool-registry';

@Module({
  imports: [AuthModule, ConversationModule, TaskModule, ApprovalModule, EventModule],
  providers: [
    ToolRegistry,
    PolicyEngine,
    {
      provide: ToolInvoker,
      inject: [
        ToolRegistry,
        PolicyEngine,
        InMemoryApprovalStore,
        TaskService,
        InMemoryConversationStore,
        AuthContextService,
        ExecutionCredentialResolver,
        EventBusService,
      ],
      useFactory: createToolInvoker,
    },
  ],
  exports: [ToolInvoker, ToolRegistry],
})
export class ToolModule {}
