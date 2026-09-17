/** Internal search types; these are not HTTP or shared wire contracts. */
export interface HotelSearchInput {
  /** Exact destination match, ignoring surrounding whitespace and case. */
  destination: string;
}

export interface HotelSearchResult {
  id: string;
  name: string;
  destination: string;
  price?: number;
  currency?: string;
  description?: string;
}

export interface HotelSearchResponse {
  /** V1 returns fictional demo data only. */
  mock: true;
  hotels: HotelSearchResult[];
}

/** Internal cart types; rooms is required after tool schema defaulting. */
export interface AddReservationToCartInput {
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  /** Binding identifier for execution and audit. */
  travelerId: string;
  /** Human display data only. */
  travelerName: string;
  rooms: number;
  totalPrice: number;
  currency: string;
}

export interface AddReservationToCartResponse {
  mock: true;
  cartItemId: string;
  status: 'added';
}

/** Internal confirmation types; not shared wire contracts. */
export interface ConfirmBookingInput {
  cartItemId: string;
  /** Binding identifier for execution and audit. */
  travelerId: string;
  /** Human display data only. */
  travelerName: string;
  totalPrice: number;
  currency: string;
}

export interface ConfirmBookingResponse {
  mock: true;
  bookingId: string;
  status: 'confirmed';
}

/** Internal cancellation types; not shared wire contracts. */
export interface CancelBookingInput {
  bookingId: string;
  /** Binding identifier for execution and audit. */
  travelerId: string;
  /** Human display data only. */
  travelerName: string;
  reason?: string;
}

export interface CancelBookingResponse {
  mock: true;
  bookingId: string;
  status: 'cancelled';
}

/** Internal client seam for authorized executors. */
export interface NoktosClient {
  searchHotels(input: HotelSearchInput): Promise<HotelSearchResponse>;
  addReservationToCart(input: AddReservationToCartInput): Promise<AddReservationToCartResponse>;
  confirmBooking(input: ConfirmBookingInput): Promise<ConfirmBookingResponse>;
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResponse>;
}
