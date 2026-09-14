import type { RuntimeConfig } from '../config/runtime-config';
import type { LlmAssistantOutput, LlmProvider, LlmRequest } from './llm-provider';

export class LlmProviderRegistry {
  private readonly providers = new Map<string, LlmProvider>();
  private readonly providerKey: string;
  private readonly model: string;

  constructor(config: Pick<RuntimeConfig, 'llmProvider' | 'llmModel'>) {
    if (!config.llmProvider.trim() || !config.llmModel.trim()) {
      throw new Error('LLM provider and model configuration must not be blank.');
    }

    this.providerKey = config.llmProvider.trim();
    this.model = config.llmModel.trim();
  }

  register(key: string, provider: LlmProvider): void {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error('LLM provider key must not be blank.');
    }
    if (this.providers.has(normalizedKey)) {
      throw new Error('LLM provider is already registered.');
    }

    this.providers.set(normalizedKey, provider);
  }

  async generate(request: LlmRequest): Promise<LlmAssistantOutput> {
    const provider = this.providers.get(this.providerKey);
    if (provider === undefined) {
      throw new Error('Configured LLM provider is not registered.');
    }

    return provider.generate(this.model, request);
  }
}
