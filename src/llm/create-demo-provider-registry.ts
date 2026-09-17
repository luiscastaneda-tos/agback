import type { RuntimeConfig } from '../config/runtime-config';
import { DemoScriptedLlmProvider } from './demo-scripted-llm-provider';
import { LlmProviderRegistry } from './llm-provider-registry';
import { OpenAiLlmProvider } from './openai-llm-provider';

export function createDemoProviderRegistry(
  config: RuntimeConfig,
): LlmProviderRegistry {
  const registry = new LlmProviderRegistry(config);
  const demoProvider = new DemoScriptedLlmProvider();
  registry.register('demo-provider', demoProvider);

  const apiKey = config.openaiApiKey || config.llmApiKey;
  if (apiKey) {
    const openaiProvider = new OpenAiLlmProvider({
      apiKey,
      baseUrl: config.openaiBaseUrl || config.llmBaseUrl,
      fallbackProvider: demoProvider,
    });
    registry.register('openai', openaiProvider);
  }

  return registry;
}
