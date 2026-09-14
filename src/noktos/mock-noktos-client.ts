import type {
  HotelSearchInput,
  HotelSearchResponse,
  HotelSearchResult,
  NoktosClient,
} from './noktos-client';

/** All names, identifiers and destinations are fictional demo fixtures. */
const FICTIONAL_HOTELS: readonly Readonly<HotelSearchResult>[] = [
  {
    id: 'mock-hotel-001',
    name: 'Mock Lantern House',
    destination: 'Demo Harbor',
  },
  {
    id: 'mock-hotel-002',
    name: 'Mock Cloud Garden',
    destination: 'Demo Harbor',
  },
  {
    id: 'mock-hotel-003',
    name: 'Mock Starlight Lodge',
    destination: 'Demo Valley',
  },
];

/** In-memory fictional search only; no credentials or live availability. */
export class MockNoktosClient implements NoktosClient {
  async searchHotels(input: HotelSearchInput): Promise<HotelSearchResponse> {
    console.info('[MOCK] Noktos hotel search adapter invoked.');

    const destination = input.destination.trim().toLowerCase();
    return {
      mock: true,
      hotels: FICTIONAL_HOTELS
        .filter((hotel) => hotel.destination.toLowerCase() === destination)
        .map((hotel) => ({ ...hotel })),
    };
  }
}
