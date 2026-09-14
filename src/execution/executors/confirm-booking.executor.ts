import { MockNoktosClient } from '../../noktos/mock-noktos-client';
import type {
  ConfirmBookingInput,
  ConfirmBookingResponse,
} from '../../noktos/noktos-client';
import type { ExecutionContext } from '../execution-context';
import type { Executor } from '../executor';

export class ConfirmBookingExecutor implements Executor<ConfirmBookingInput> {
  private readonly client = new MockNoktosClient();

  execute(
    args: ConfirmBookingInput,
    _ctx: ExecutionContext,
  ): Promise<ConfirmBookingResponse> {
    return this.client.confirmBooking({
      cartItemId: args.cartItemId,
      travelerId: args.travelerId,
      travelerName: args.travelerName,
      totalPrice: args.totalPrice,
      currency: args.currency,
    });
  }
}
