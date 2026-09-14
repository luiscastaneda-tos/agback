import { Controller, Get, UseGuards } from '@nestjs/common';

import { AgentDescriptor } from '../agents/agent-descriptor';
import { AgentRegistryService } from '../agents/registry/agent-registry.service';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';

@Controller('agents')
@UseGuards(BearerAuthGuard)
export class AgentsController {
  constructor(private readonly registry: AgentRegistryService) {}

  @Get()
  list(): AgentDescriptor[] {
    // Explicit wire projection to the frozen contracts/agent.ts shape.
    return this.registry.list().map((descriptor) => ({
      name: descriptor.name,
      displayName: descriptor.displayName,
      description: descriptor.description,
      kind: descriptor.kind,
      toolNames: [...descriptor.toolNames],
      status: descriptor.status,
    }));
  }
}
