import { MockNoktosClient } from '../../noktos/mock-noktos-client';
import type { HotelSearchInput, HotelSearchResponse } from '../../noktos/noktos-client';
import type { ExecutionContext } from '../execution-context';
import type { Executor } from '../executor';

export class SearchHotelsExecutor implements Executor<HotelSearchInput> {
  private readonly client = new MockNoktosClient();

  execute(args: HotelSearchInput, _ctx: ExecutionContext): Promise<HotelSearchResponse> {
    return this.client.searchHotels({ destination: args.destination });
  }
}
