import { Injectable } from '@nestjs/common';

import { AgentDescriptor } from '../agent-descriptor';

@Injectable()
export class AgentRegistryService {
  private readonly descriptors = new Map<string, AgentDescriptor>();

  register(descriptor: AgentDescriptor): AgentDescriptor {
    if (this.descriptors.has(descriptor.name)) {
      throw new Error('Agent is already registered.');
    }

    const stored = this.copy(descriptor);
    this.descriptors.set(stored.name, stored);
    return this.copy(stored);
  }

  list(): AgentDescriptor[] {
    return Array.from(this.descriptors.values(), (descriptor) => this.copy(descriptor));
  }

  markIdle(name: string): AgentDescriptor {
    return this.setStatus(name, 'idle');
  }

  markBusy(name: string): AgentDescriptor {
    return this.setStatus(name, 'busy');
  }

  private setStatus(name: string, status: AgentDescriptor['status']): AgentDescriptor {
    const descriptor = this.descriptors.get(name);
    if (descriptor === undefined) {
      throw new Error('Agent is not registered.');
    }

    descriptor.status = status;
    return this.copy(descriptor);
  }

  private copy(descriptor: AgentDescriptor): AgentDescriptor {
    // Store only declared metadata, even when callers supply additional fields.
    return {
      name: descriptor.name,
      displayName: descriptor.displayName,
      description: descriptor.description,
      kind: descriptor.kind,
      toolNames: [...descriptor.toolNames],
      status: descriptor.status,
    };
  }
}
