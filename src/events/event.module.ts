import { Module } from '@nestjs/common';

import { EventBusService } from './event-bus.service';

@Module({
  providers: [
    {
      provide: EventBusService,
      useFactory: () => new EventBusService(),
    },
  ],
  exports: [EventBusService],
})
export class EventModule {}

