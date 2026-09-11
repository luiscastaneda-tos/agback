import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AgentTask, CreateAgentTaskInput } from './agent-task';
import { assertLegalTaskTransition, TaskTransition } from './task-transition';

@Injectable()
export class InMemoryTaskStore {
  private readonly tasks = new Map<string, AgentTask>();

  create(input: CreateAgentTaskInput): AgentTask {
    const task: AgentTask = {
      id: randomUUID(),
      conversationId: input.conversationId,
      ...(input.parentTaskId === undefined
        ? {}
        : { parentTaskId: input.parentTaskId }),
      agentName: input.agentName,
      goal: input.goal,
      status: 'queued',
      authContextId: input.authContextId,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, structuredClone(task));
    return structuredClone(task);
  }

  findById(taskId: string): AgentTask | undefined {
    const task = this.tasks.get(taskId);
    return task === undefined ? undefined : structuredClone(task);
  }

  listByConversation(conversationId: string): AgentTask[] {
    return [...this.tasks.values()]
      .filter((task) => task.conversationId === conversationId)
      .map((task) => structuredClone(task));
  }

  transition(taskId: string, transition: TaskTransition): AgentTask {
    const retained = this.tasks.get(taskId);
    if (retained === undefined) {
      throw new Error(`Task not found: ${taskId}`);
    }

    assertLegalTaskTransition(retained.status, transition.status);
    const now = new Date().toISOString();
    const updated: AgentTask = {
      ...retained,
      status: transition.status,
      ...(transition.status === 'running' && retained.startedAt === undefined
        ? { startedAt: now }
        : {}),
      ...(transition.status === 'completed' ||
      transition.status === 'failed' ||
      transition.status === 'cancelled'
        ? { finishedAt: now }
        : {}),
      ...(transition.status === 'completed'
        ? { result: structuredClone(transition.result) }
        : {}),
      ...(transition.status === 'failed' || transition.status === 'cancelled'
        ? { failure: structuredClone(transition.failure) }
        : {}),
      ...(transition.status === 'awaiting_human_approval'
        ? { activeApprovalId: transition.activeApprovalId }
        : {}),
    };

    if (transition.status !== 'completed') {
      delete updated.result;
    }
    if (transition.status !== 'failed' && transition.status !== 'cancelled') {
      delete updated.failure;
    }
    if (transition.status !== 'awaiting_human_approval') {
      delete updated.activeApprovalId;
    }

    this.tasks.set(taskId, structuredClone(updated));
    return structuredClone(updated);
  }
}

