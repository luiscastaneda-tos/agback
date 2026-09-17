import { createHash } from 'node:crypto';

import type {
  AddReservationToCartInput,
  AddReservationToCartResponse,
  CancelBookingInput,
  CancelBookingResponse,
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
    id: 'mock-hotel-cancun-1',
    name: 'Mock Resort Cancún Caribe',
    destination: 'Cancún',
    price: 3200,
    currency: 'MXN',
    description: 'Resort todo incluido frente al mar con 4 albercas y vista panorámica.',
  },
  {
    id: 'mock-hotel-cancun-2',
    name: 'Mock Cancún Oasis Hotel',
    destination: 'Cancún',
    price: 2450,
    currency: 'MXN',
    description: 'Hotel moderno en zona hotelera, ideal para descanso con desayuno buffet.',
  },
  {
    id: 'mock-hotel-cancun-3',
    name: 'Mock Playa Cancún Suites',
    destination: 'Cancún',
    price: 1890,
    currency: 'MXN',
    description: 'Suites confortables a 5 minutos de la playa con wifi de alta velocidad y terraza.',
  },
  {
    id: 'mock-hotel-001',
    name: 'Mock Lantern House',
    destination: 'Demo Harbor',
    price: 1500,
    currency: 'MXN',
    description: 'Fictional demo hotel near the harbor.',
  },
  {
    id: 'mock-hotel-002',
    name: 'Mock Cloud Garden',
    destination: 'Demo Harbor',
    price: 1750,
    currency: 'MXN',
    description: 'Fictional garden view demo hotel.',
  },
  {
    id: 'mock-hotel-003',
    name: 'Mock Starlight Lodge',
    destination: 'Demo Valley',
    price: 2100,
    currency: 'MXN',
    description: 'Fictional valley lodge demo hotel.',
  },
];

/** Fictional demo adapter only; no credentials or live integration. */
export class MockNoktosClient implements NoktosClient {
  async cancelBooking(input: CancelBookingInput): Promise<CancelBookingResponse> {
    console.info('[MOCK] Noktos booking cancellation adapter invoked.');

    return {
      mock: true,
      bookingId: input.bookingId,
      status: 'cancelled',
    };
  }

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

    const normalize = (s: string) =>
      s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const query = normalize(input.destination);
    let matched = FICTIONAL_HOTELS.filter((hotel) => {
      const dest = normalize(hotel.destination);
      return dest === query || dest.includes(query) || query.includes(dest);
    });

    // Fallback to Cancun mock hotels if no direct match was found
    if (matched.length === 0) {
      matched = FICTIONAL_HOTELS.filter((hotel) => normalize(hotel.destination) === 'cancun');
    }

    return {
      mock: true,
      hotels: matched.map((hotel) => ({ ...hotel })),
    };
  }
}
