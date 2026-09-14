import { z } from 'zod';

import type { LlmProvider } from '../../llm/llm-provider';
import type { AgentRuntime, ToolContext, ToolOutcome } from '../../tools/agent-runtime';
import { ToolInvocationFailure } from '../../tools/agent-runtime';
import type { ToolHandle } from '../../tools/tool-handle';
import type { AgentDescriptor } from '../agent-descriptor';

const CART_TOOL = 'add_reservation_to_cart';
const CONFIRM_TOOL = 'confirm_booking';

const DELEGATION_INTENT = 'delegate_to_hotel_search';

export const SUPERVISOR_SYSTEM_PROMPT = `You are SupervisorAgent, assisting with
fictional mock hotels. Answer directly when no action is needed, or ask
for clarification when the goal is unclear. For hotel searches, request
delegation exclusively to HotelSearchAgent using delegate_to_hotel_search with
only a non-empty goal. Delegation is an inert intent: it does not execute or
wait for a search. Request at most one intent or tool call per run. Never claim that delegated
work has completed. Clearly label hotel assistance as fictional mock data;
never claim live availability or real bookings. Use add_reservation_to_cart
to request adding a fictional reservation to the cart.
This requires owner approval before execution; never claim cart success while
approval is pending. Use confirm_booking to request fictional booking confirmation,
which also requires owner approval before execution. Claim confirmation only after
a completed, validated tool result. Do not cancel bookings. Do not request other
agents or tools.`;

const delegationArgsSchema = z.strictObject({
  goal: z.string().min(1).regex(/\S/),
});

const assistantOutputSchema = z.object({
  text: z.string(),
  toolCalls: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.json(),
  })).max(1),
});

const cartResultSchema = z.object({
  mock: z.literal(true),
  cartItemId: z.string().min(1),
  status: z.literal('added'),
});

const confirmationResultSchema = z.object({
  mock: z.literal(true),
  bookingId: z.string().min(1).regex(/\S/),
  status: z.literal('confirmed'),
});

/** Internal decisions only; orchestration owns task creation and lifecycle. */
export type SupervisorAgentOutcome =
  | { kind: 'completed'; text: string }
  | { kind: 'confirmation_completed'; data: z.infer<typeof confirmationResultSchema> }
  | { kind: 'cart_completed'; data: z.infer<typeof cartResultSchema> }
  | { kind: 'stopped'; outcome: Exclude<ToolOutcome, { kind: 'completed' }> }
  | { kind: 'delegated'; agentName: 'HotelSearchAgent'; goal: string }
  | { kind: 'failed'; code:
      | 'INVALID_INPUT'
      | 'PROVIDER_FAILED'
      | 'MALFORMED_OUTPUT'
      | 'TOOL_NOT_ALLOWED'
      | 'TOOL_FAILED'
      | 'AUTH_CONTEXT_EXPIRED'
  };

export class SupervisorAgent {
  constructor(
    private readonly provider: LlmProvider,
    private readonly model: string,
    private readonly cartHandle: ToolHandle,
    private readonly confirmationHandle: ToolHandle,
    private readonly runtime: AgentRuntime,
  ) {}

  /** A fresh inert descriptor; lifecycle state is managed outside this core. */
  get descriptor(): AgentDescriptor {
    return {
      name: 'SupervisorAgent',
      displayName: 'Supervisor',
      description: 'Answers questions, delegates mock hotel searches, or requests approval for fictional cart additions and booking confirmations.',
      kind: 'supervisor',
      // Delegation is orchestration metadata, not a registered business tool.
      toolNames: [CART_TOOL, CONFIRM_TOOL],
      status: 'idle',
    };
  }

  async run(goal: string, context: ToolContext): Promise<SupervisorAgentOutcome> {
    if (typeof goal !== 'string' || !goal.trim()
      || typeof this.model !== 'string' || !this.model.trim()
      || this.cartHandle.name !== CART_TOOL
      || this.confirmationHandle.name !== CONFIRM_TOOL) {
      return { kind: 'failed', code: 'INVALID_INPUT' };
    }

    let rawOutput: unknown;
    try {
      rawOutput = await this.provider.generate(this.model, {
        messages: [
          { role: 'system', text: SUPERVISOR_SYSTEM_PROMPT },
          { role: 'user', text: goal },
        ],
        // The provider's tool shape transports an intent, with no executor.
        tools: [{
          name: DELEGATION_INTENT,
          description: 'Request a fictional mock hotel search by HotelSearchAgent.',
          argsSchema: z.toJSONSchema(delegationArgsSchema),
        }, {
          name: CART_TOOL,
          description: this.cartHandle.description,
          argsSchema: structuredClone(this.cartHandle.argsSchema),
        }, {
          name: CONFIRM_TOOL,
          description: this.confirmationHandle.description,
          argsSchema: structuredClone(this.confirmationHandle.argsSchema),
        }],
      });
    } catch {
      return { kind: 'failed', code: 'PROVIDER_FAILED' };
    }

    try {
      const parsed = assistantOutputSchema.safeParse(rawOutput);
      if (!parsed.success) {
        return { kind: 'failed', code: 'MALFORMED_OUTPUT' };
      }
      const output = parsed.data;
      const call = output.toolCalls[0];
      if (call === undefined) {
        return output.text.trim()
          ? { kind: 'completed', text: output.text }
          : { kind: 'failed', code: 'MALFORMED_OUTPUT' };
      }
      if (call.name === CART_TOOL || call.name === CONFIRM_TOOL) {
        try {
          const outcome = await this.runtime.invoke(call.name, call.arguments, context);
          switch (outcome.kind) {
            case 'awaiting_approval':
            case 'rejected':
            case 'forbidden':
              return { kind: 'stopped', outcome };
            case 'completed': {
              if (call.name === CONFIRM_TOOL) {
                const result = confirmationResultSchema.safeParse(outcome.data);
                if (!result.success) return { kind: 'failed', code: 'TOOL_FAILED' };
                return {
                  kind: 'confirmation_completed',
                  data: {
                    mock: result.data.mock,
                    bookingId: result.data.bookingId,
                    status: result.data.status,
                  },
                };
              }
              const result = cartResultSchema.safeParse(outcome.data);
              if (!result.success) return { kind: 'failed', code: 'TOOL_FAILED' };
              return {
                kind: 'cart_completed',
                data: {
                  mock: result.data.mock,
                  cartItemId: result.data.cartItemId,
                  status: result.data.status,
                },
              };
            }
            default:
              return { kind: 'failed', code: 'TOOL_FAILED' };
          }
        } catch (error) {
          return {
            kind: 'failed',
            code: error instanceof ToolInvocationFailure && error.code === 'AUTH_CONTEXT_EXPIRED'
              ? 'AUTH_CONTEXT_EXPIRED' : 'TOOL_FAILED',
          };
        }
      }
      if (call.name !== DELEGATION_INTENT) {
        return { kind: 'failed', code: 'TOOL_NOT_ALLOWED' };
      }
      const args = delegationArgsSchema.safeParse(call.arguments);
      if (!args.success) {
        return { kind: 'failed', code: 'MALFORMED_OUTPUT' };
      }
      return {
        kind: 'delegated',
        agentName: 'HotelSearchAgent',
        goal: args.data.goal,
      };
    } catch {
      return { kind: 'failed', code: 'MALFORMED_OUTPUT' };
    }
  }
}
