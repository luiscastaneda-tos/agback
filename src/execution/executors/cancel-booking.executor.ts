import { MockNoktosClient } from '../../noktos/mock-noktos-client';
import type {
  CancelBookingInput,
  CancelBookingResponse,
} from '../../noktos/noktos-client';
import type { ExecutionContext } from '../execution-context';
import type { Executor } from '../executor';

export class CancelBookingExecutor implements Executor<CancelBookingInput> {
  private readonly client = new MockNoktosClient();

  execute(
    args: CancelBookingInput,
    _ctx: ExecutionContext,
  ): Promise<CancelBookingResponse> {
    return this.client.cancelBooking({
      bookingId: args.bookingId,
      travelerId: args.travelerId,
      travelerName: args.travelerName,
      ...(args.reason === undefined ? {} : { reason: args.reason }),
    });
  }
}
