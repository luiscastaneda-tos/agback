import type { ExecutionContext } from './execution-context';

export interface Executor<TArgs> {
  execute(args: TArgs, ctx: ExecutionContext): Promise<unknown>;
}
