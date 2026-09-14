import type { Executor } from './executor';

/**
 * Internal resolution seam for the future ToolInvoker only.
 * Future concrete executor imports belong here; registration never executes them.
 */
export class ExecutorRegistry {
  private readonly entries = new Map<string, Executor<unknown>>();

  register<TArgs>(executorKey: string, executor: Executor<TArgs>): void {
    this.requireKey(executorKey);
    if (this.entries.has(executorKey)) {
      throw new Error('Executor is already registered.');
    }
    this.entries.set(executorKey, executor);
  }

  /** Arguments must be schema-validated by ToolInvoker before execution. */
  get(executorKey: string): Executor<unknown> | undefined {
    this.requireKey(executorKey);
    return this.entries.get(executorKey);
  }

  private requireKey(executorKey: string): void {
    if (executorKey.trim().length === 0) {
      throw new Error('Executor key must not be empty.');
    }
  }
}
