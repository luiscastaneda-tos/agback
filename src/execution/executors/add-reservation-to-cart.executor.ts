import { MockNoktosClient } from '../../noktos/mock-noktos-client';
import type {
  AddReservationToCartInput,
  AddReservationToCartResponse,
} from '../../noktos/noktos-client';
import type { ExecutionContext } from '../execution-context';
import type { Executor } from '../executor';

export class AddReservationToCartExecutor implements Executor<AddReservationToCartInput> {
  private readonly client = new MockNoktosClient();

  execute(
    args: AddReservationToCartInput,
    _ctx: ExecutionContext,
  ): Promise<AddReservationToCartResponse> {
    return this.client.addReservationToCart({
      hotelId: args.hotelId,
      hotelName: args.hotelName,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      travelerId: args.travelerId,
      travelerName: args.travelerName,
      rooms: args.rooms,
      totalPrice: args.totalPrice,
      currency: args.currency,
    });
  }
}
