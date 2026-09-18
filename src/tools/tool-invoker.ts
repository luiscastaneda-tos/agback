import type { CreateApprovalRequestInput } from '../approvals/approval-request';
import type { InMemoryApprovalStore } from '../approvals/in-memory-approval.store';
import type { AuthContextService, ExecutionCredentialResolver } from '../auth/auth-context.service';
import { AuthenticationFailure } from '../auth/auth-token-verifier';
import type { InMemoryConversationStore } from '../conversations/in-memory-conversation.store';
import type { EventBusService } from '../events/event-bus.service';
import type { ExecutionContext } from '../execution/execution-context';
import { ExecutorRegistry } from '../execution/executor-registry';
import { payloadHash } from '../policy/payload-hash';
import type { PolicyEngine } from '../policy/policy-engine';
import type { TaskService } from '../tasks/task.service';
import type { AgentRuntime, ToolContext, ToolOutcome } from './agent-runtime';
import { ToolInvocationFailure } from './agent-runtime';
import type { ToolRegistry } from './tool-registry';

export { ToolInvocationFailure } from './agent-runtime';

/** Application composition only; construction does not perform an invocation. */
export function createToolInvoker(
  tools: ToolRegistry,
  policy: PolicyEngine,
  approvals: InMemoryApprovalStore,
  tasks: TaskService,
  conversations: InMemoryConversationStore,
  authContexts: AuthContextService,
  credentials: ExecutionCredentialResolver,
  events: EventBusService,
): ToolInvoker {
  return new ToolInvoker(
    tools, policy, approvals, tasks, conversations, authContexts, credentials,
    new ExecutorRegistry(), events,
  );
}

/** Sole execution seam. Never pass its service dependencies to agents. */
export class ToolInvoker implements AgentRuntime {
  constructor(
    private readonly tools: ToolRegistry,
    private readonly policy: PolicyEngine,
    private readonly approvals: InMemoryApprovalStore,
    private readonly tasks: TaskService,
    private readonly conversations: InMemoryConversationStore,
    private readonly authContexts: AuthContextService,
    private readonly credentials: ExecutionCredentialResolver,
    private readonly executors: ExecutorRegistry,
    private readonly events: EventBusService,
  ) {}

  async invoke(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    try {
      return await this.invokeValidated(toolName, args, ctx);
    } catch (error) {
      if (error instanceof ToolInvocationFailure) throw error;
      // Discard schema, preview, registry and other upstream exception details.
      throw new ToolInvocationFailure('TOOL_ERROR');
    }
  }

  private async invokeValidated(
    toolName: string, args: unknown, ctx: ToolContext,
  ): Promise<ToolOutcome> {
    const definition = this.tools.getDefinition(toolName);
    if (definition === undefined) {
      return { kind: 'forbidden', reason: 'Tool is unavailable.' };
    }
    const parsed = definition.argsSchema.safeParse(args);
    if (!parsed.success) {
      return { kind: 'rejected', reason: 'Invalid tool arguments.' };
    }
    const policy = this.policy.evaluate(definition.name, parsed.data);
    if (policy !== 'AUTO' && policy !== 'HUMAN_APPROVAL_REQUIRED') {
      return { kind: 'forbidden', reason: 'Action is forbidden.' };
    }

    const task = this.tasks.findById(ctx.taskId);
    const conversation = this.conversations.getById(ctx.conversationId);
    if (task === undefined || conversation === undefined ||
        task.id !== ctx.taskId || task.conversationId !== conversation.id ||
        conversation.id !== ctx.conversationId ||
        task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return { kind: 'forbidden', reason: 'Task is unavailable.' };
    }
    const identity = this.resolveAuth(() => this.authContexts.lookup(task.authContextId));
    if (identity.userId !== conversation.userId) {
      return { kind: 'forbidden', reason: 'Task is unavailable.' };
    }

    if (ctx.approvalId !== undefined && ctx.approvalId !== task.activeApprovalId) {
      return { kind: 'rejected', reason: 'Approval is unavailable.' };
    }

    if (policy === 'HUMAN_APPROVAL_REQUIRED') {
      const hash = payloadHash(definition, parsed.data as Record<string, unknown>, {
        conversationId: conversation.id, taskId: task.id,
      });
      const requestInput = (): CreateApprovalRequestInput => ({
        conversationId: conversation.id,
        taskId: task.id,
        action: definition.name,
        actionVersion: definition.actionVersion,
        requestedByAgent: task.agentName,
        summary: definition.description,
        inputPreview: definition.toPreview(parsed.data),
        payloadHash: hash,
        validatedArguments: structuredClone(parsed.data),
      });
      if (ctx.approvalId === undefined) {
        const approval = this.approvals.create(requestInput());
        return { kind: 'awaiting_approval', approvalId: approval.id };
      }
      const approval = this.approvals.findById(ctx.approvalId);
      if (approval === undefined || approval.taskId !== task.id ||
          approval.conversationId !== conversation.id ||
          approval.action !== definition.name || approval.actionVersion !== definition.actionVersion ||
          !(Date.parse(approval.expiresAt) > Date.now()) ||
          (approval.status !== 'pending' && approval.status !== 'approved')) {
        return { kind: 'rejected', reason: 'Approval is unavailable.' };
      }
      if (approval.payloadHash !== hash) {
        const result = this.approvals.supersedeOnMismatch(approval.id, requestInput());
        if (result.kind !== 'replaced') {
          return { kind: 'rejected', reason: 'Approval is unavailable.' };
        }
        this.events.publish({
          type: 'approval.superseded',
          conversationId: conversation.id,
          taskId: task.id,
          correlationId: ctx.correlationId ?? task.id,
          payload: {
            approvalId: approval.id,
            status: 'superseded',
            action: approval.action,
          },
        });
        if (!this.tasks.clearActiveApproval(task.id, approval.id)) {
          return { kind: 'rejected', reason: 'Approval is unavailable.' };
        }
        return { kind: 'awaiting_approval', approvalId: result.replacement.id };
      }
      if (approval.status === 'pending') {
        return { kind: 'awaiting_approval', approvalId: approval.id };
      }
      if (approval.resolvedBy !== conversation.userId || !this.approvals.consume(approval.id, hash)) {
        return { kind: 'rejected', reason: 'Approval is unavailable.' };
      }
      if (!this.tasks.clearActiveApproval(task.id, approval.id)) {
        return { kind: 'rejected', reason: 'Approval is unavailable.' };
      }
    }

    // No asynchronous yield between approval checks, consumption and resolution.
    const executor = this.executors.get(definition.executorKey);
    if (executor === undefined) throw new ToolInvocationFailure('TOOL_ERROR');
    const credential = this.resolveAuth(() => this.credentials.resolveForExecution(task.authContextId));
    if (credential.userId !== conversation.userId) {
      return { kind: 'forbidden', reason: 'Task is unavailable.' };
    }
    const executionContext: ExecutionContext = {
      conversationId: conversation.id,
      taskId: task.id,
      userId: credential.userId,
      accessToken: credential.accessToken,
      expiresAt: credential.expiresAt,
    };
    try {
      this.events.publish({
        type: 'tool.called',
        conversationId: conversation.id,
        taskId: task.id,
        agentName: task.agentName,
        correlationId: ctx.correlationId ?? task.id,
        payload: {
          action: definition.name,
          argsPreview: definition.toPreview(parsed.data).map(({ label, value }) => ({ label, value })),
        },
      });
      const data = await executor.execute(parsed.data, executionContext);
      this.events.publish({
        type: 'tool.completed',
        conversationId: conversation.id,
        taskId: task.id,
        agentName: task.agentName,
        correlationId: ctx.correlationId ?? task.id,
        payload: { action: definition.name },
      });
      return { kind: 'completed', data };
    } catch {
      throw new ToolInvocationFailure('TOOL_ERROR');
    }
  }

  private resolveAuth<T>(resolve: () => T): T {
    try {
      return resolve();
    } catch (error) {
      throw new ToolInvocationFailure(
        error instanceof AuthenticationFailure && error.code === 'AUTH_CONTEXT_EXPIRED'
          ? 'AUTH_CONTEXT_EXPIRED' : 'TOOL_ERROR',
      );
    }
  }
}
