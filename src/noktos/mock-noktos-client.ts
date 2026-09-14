import { createHash } from 'node:crypto';

import type {
  AddReservationToCartInput,
  AddReservationToCartResponse,
  ConfirmBookingInput,
  ConfirmBookingResponse,
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

/** Fictional demo adapter only; no credentials or live integration. */
export class MockNoktosClient implements NoktosClient {
  async confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResponse> {
    console.info('[MOCK] Noktos booking confirmation adapter invoked.');

    // Fixed field order makes the synthetic identifier independent of key order.
    const booking = JSON.stringify([
      input.cartItemId,
      input.travelerId,
      input.travelerName,
      input.totalPrice,
      input.currency,
    ]);
    return {
      mock: true,
      bookingId: `mock-booking-${createHash('sha256').update(booking).digest('hex')}`,
      status: 'confirmed',
    };
  }

  async addReservationToCart(
    input: AddReservationToCartInput,
  ): Promise<AddReservationToCartResponse> {
    console.info('[MOCK] Noktos cart adapter invoked.');

    // Fixed field order makes the synthetic identifier independent of key order.
    const reservation = JSON.stringify([
      input.hotelId,
      input.hotelName,
      input.checkIn,
      input.checkOut,
      input.travelerId,
      input.travelerName,
      input.rooms,
      input.totalPrice,
      input.currency,
    ]);
    return {
      mock: true,
      cartItemId: `mock-cart-${createHash('sha256').update(reservation).digest('hex')}`,
      status: 'added',
    };
  }

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
