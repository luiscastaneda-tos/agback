import type { RuntimeConfig } from '../config/runtime-config';
import { DemoScriptedLlmProvider } from './demo-scripted-llm-provider';
import { LlmProviderRegistry } from './llm-provider-registry';

/** Explicit DEMO / FICTIONAL / SCRIPTED composition; no fallback provider. */
export function createDemoProviderRegistry(
  config: Pick<RuntimeConfig, 'llmProvider' | 'llmModel'>,
): LlmProviderRegistry {
  const registry = new LlmProviderRegistry(config);
  registry.register('demo-provider', new DemoScriptedLlmProvider());
  return registry;
}
