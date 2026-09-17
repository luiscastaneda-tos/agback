import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';

import type { ToolHandle } from '../tools/tool-handle';
import type {
  LlmAssistantOutput,
  LlmJsonValue,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmToolCall,
} from './llm-provider';

export interface OpenAiLlmProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fallbackProvider: LlmProvider;
}

/**
 * OpenAI LLM provider utilizing the official OpenAI SDK.
 * Implements strict intent generation only; execution remains with the runtime pipeline.
 */
export class OpenAiLlmProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly fallbackProvider: LlmProvider;

  constructor(options: OpenAiLlmProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new Error('OpenAI API key must not be blank.');
    }

    this.client = new OpenAI({
      apiKey,
      ...(options.baseUrl?.trim() ? { baseURL: options.baseUrl.trim() } : {}),
    });
    this.fallbackProvider = options.fallbackProvider;
  }

  async generate(model: string, request: LlmRequest): Promise<LlmAssistantOutput> {
    // Deterministic fallback for demo: commands (e.g. demo:greeting, demo:hotel-delegation)
    let lastUserMessageText: string | undefined;
    for (let i = request.messages.length - 1; i >= 0; i--) {
      if (request.messages[i].role === 'user') {
        lastUserMessageText = (request.messages[i] as { text: string }).text;
        break;
      }
    }

    if (lastUserMessageText?.startsWith('demo:')) {
      return this.fallbackProvider.generate(model, request);
    }

    const messages = this.formatMessages(request.messages);
    const tools = this.formatTools(request.tools);

    const completion = await this.client.chat.completions.create({
      model,
      messages,
      ...(tools.length > 0
        ? {
            tools,
            tool_choice: 'auto',
            parallel_tool_calls: false,
          }
        : {}),
      temperature: 0.2,
    });

    const choice = completion.choices?.[0];
    if (!choice?.message) {
      throw new Error('OpenAI returned empty choices.');
    }

    const text = choice.message.content ?? choice.message.refusal ?? '';
    const toolCalls: LlmToolCall[] = [];

    if (Array.isArray(choice.message.tool_calls)) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== 'function' || !tc.function?.name) continue;

        let parsedArgs: LlmJsonValue = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}') as LlmJsonValue;
        } catch {
          parsedArgs = {};
        }

        toolCalls.push({
          id: tc.id || `call_${randomUUID()}`,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    return {
      text,
      toolCalls,
    };
  }

  private formatMessages(
    messages: readonly LlmMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      if (m.role === 'system') {
        return {
          role: 'system',
          content: m.text,
        };
      }

      if (m.role === 'user') {
        return {
          role: 'user',
          content: m.text,
        };
      }

      if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.text || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: 'assistant',
          content: m.text,
        };
      }

      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content),
        };
      }

      throw new Error(`Unsupported message role: ${(m as any).role}`);
    });
  }

  private formatTools(
    tools: readonly ToolHandle[],
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => {
      const rawSchema = tool.argsSchema;
      const parameters: Record<string, unknown> =
        rawSchema && typeof rawSchema === 'object'
          ? { ...(rawSchema as Record<string, unknown>) }
          : { type: 'object', properties: {} };

      delete parameters.$schema;

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters,
        },
      };
    });
  }
}
