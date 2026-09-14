import { Module, OnModuleInit } from '@nestjs/common';

import { HotelSearchAgent } from './agents/hotel-search/hotel-search.agent';
import { AgentRegistryModule } from './agents/registry/agent-registry.module';
import { AgentRegistryService } from './agents/registry/agent-registry.service';
import { SupervisorAgent } from './agents/supervisor/supervisor.agent';
import { loadRuntimeConfig } from './config/runtime-config';
import { EventBusService } from './events/event-bus.service';
import { EventModule } from './events/event.module';
import { createDemoProviderRegistry } from './llm/create-demo-provider-registry';
import type { LlmProvider } from './llm/llm-provider';
import { HotelSearchTaskProcessor } from './tasks/hotel-search-task-processor';
import { SupervisorTaskProcessor } from './tasks/supervisor-task-processor';
import { TaskDelegationService } from './tasks/task-delegation.service';
import { TaskProcessorRegistry } from './tasks/task-processor';
import { TaskModule } from './tasks/task.module';
import { ToolInvoker } from './tools/tool-invoker';
import { ToolRegistry } from './tools/tool-registry';
import { ToolModule } from './tools/tool.module';

@Module({
  imports: [TaskModule, AgentRegistryModule, ToolModule, EventModule],
})
export class AgentRuntimeModule implements OnModuleInit {
  constructor(
    private readonly agents: AgentRegistryService,
    private readonly processors: TaskProcessorRegistry,
    private readonly delegation: TaskDelegationService,
    private readonly tools: ToolRegistry,
    private readonly invoker: ToolInvoker,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit(): void {
    const config = loadRuntimeConfig();
    const registry = createDemoProviderRegistry(config);
    // The registry owns configured provider/model selection, including failures.
    const provider: LlmProvider = {
      generate: (_model, request) => registry.generate(request),
    };
    const searchHandle = this.tools.getHandle('search_hotels');
    if (searchHandle === undefined) {
      throw new Error('Hotel search tool is not registered.');
    }

    const cartHandle = this.tools.getHandle('add_reservation_to_cart');
    if (cartHandle === undefined) {
      throw new Error('Reservation cart tool is not registered.');
    }
    const confirmationHandle = this.tools.getHandle('confirm_booking');
    if (confirmationHandle === undefined) {
      throw new Error('Booking confirmation tool is not registered.');
    }
    const cancellationHandle = this.tools.getHandle('cancel_booking');
    if (cancellationHandle === undefined) {
      throw new Error('Booking cancellation tool is not registered.');
    }
    const supervisor = new SupervisorAgent(
      provider, config.llmModel, cartHandle, confirmationHandle, cancellationHandle, this.invoker,
    );
    const hotelSearch = new HotelSearchAgent(
      provider, config.llmModel, searchHandle, this.invoker,
    );

    // Nest completes module initialization before accepting HTTP traffic.
    this.agents.register(supervisor.descriptor);
    this.agents.register(hotelSearch.descriptor);
    this.processors.register(
      supervisor.descriptor.name,
      new SupervisorTaskProcessor(supervisor, this.delegation),
    );
    this.processors.register(
      hotelSearch.descriptor.name,
      new HotelSearchTaskProcessor(hotelSearch, this.eventBus),
    );
  }
}
