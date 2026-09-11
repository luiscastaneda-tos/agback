import { Injectable } from '@nestjs/common';

import { AgentTask, TaskFailure, TaskResult } from './agent-task';

export type TaskProcessorOutcome =
  | { kind: 'completed'; result: TaskResult }
  | { kind: 'awaiting_human_approval'; activeApprovalId: string }
  | { kind: 'failed'; failure: TaskFailure };

export interface TaskProcessor {
  process(task: AgentTask): Promise<TaskProcessorOutcome>;
}

@Injectable()
export class TaskProcessorRegistry {
  private readonly processors = new Map<string, TaskProcessor>();

  register(agentName: string, processor: TaskProcessor): void {
    this.processors.set(agentName, processor);
  }

  resolve(agentName: string): TaskProcessor | undefined {
    return this.processors.get(agentName);
  }
}

