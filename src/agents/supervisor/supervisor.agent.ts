import { z } from 'zod';

import type { LlmProvider } from '../../llm/llm-provider';
import type { AgentDescriptor } from '../agent-descriptor';

const DELEGATION_INTENT = 'delegate_to_hotel_search';

export const SUPERVISOR_SYSTEM_PROMPT = `You are SupervisorAgent, assisting with
fictional mock hotels. Answer directly when no hotel search is needed, or ask
for clarification when the goal is unclear. For hotel searches, request
delegation exclusively to HotelSearchAgent using delegate_to_hotel_search with
only a non-empty goal. Make at most one delegation request. This is an inert
intent: it does not execute or wait for a search. Never claim that delegated
work has completed. Clearly label hotel assistance as fictional mock data;
never claim live availability or real bookings. Do not book, modify, or cancel
reservations. Do not request other agents or tools.`;

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

/** Internal decisions only; orchestration owns task creation and lifecycle. */
export type SupervisorAgentOutcome =
  | { kind: 'completed'; text: string }
  | { kind: 'delegated'; agentName: 'HotelSearchAgent'; goal: string }
  | { kind: 'failed'; code:
      | 'INVALID_INPUT'
      | 'PROVIDER_FAILED'
      | 'MALFORMED_OUTPUT'
      | 'TOOL_NOT_ALLOWED'
  };

export class SupervisorAgent {
  constructor(
    private readonly provider: LlmProvider,
    private readonly model: string,
  ) {}

  /** A fresh inert descriptor; lifecycle state is managed outside this core. */
  get descriptor(): AgentDescriptor {
    return {
      name: 'SupervisorAgent',
      displayName: 'Supervisor',
      description: 'Answers questions or delegates fictional mock hotel searches.',
      kind: 'supervisor',
      // Delegation is orchestration metadata, not a registered business tool.
      toolNames: [],
      status: 'idle',
    };
  }

  async run(goal: string): Promise<SupervisorAgentOutcome> {
    if (typeof goal !== 'string' || !goal.trim()
      || typeof this.model !== 'string' || !this.model.trim()) {
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
