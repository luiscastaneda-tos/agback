import { z } from 'zod';

import type { ToolDefinition } from './tool-definition';

const argsSchema = z.strictObject({
  hotelId: z.string(),
  hotelName: z.string(),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  travelerId: z.string(),
  travelerName: z.string(),
  rooms: z.number().int().positive().default(1),
  totalPrice: z.number().finite().positive(),
  currency: z.string(),
});

export const addReservationToCartDefinition: ToolDefinition = {
  name: 'add_reservation_to_cart',
  description: 'Add a fictional reservation to the cart using the mock adapter.',
  argsSchema,
  actionVersion: 1,
  materialFields: [
    'hotelId',
    'hotelName',
    'checkIn',
    'checkOut',
    'travelerId',
    'travelerName',
    'rooms',
    'totalPrice',
    'currency',
  ],
  toPreview: (args) => {
    const reservation = argsSchema.parse(args);
    return [
      { label: 'Hotel', value: reservation.hotelName },
      { label: 'Check-in', value: reservation.checkIn },
      { label: 'Check-out', value: reservation.checkOut },
      { label: 'Huésped', value: reservation.travelerName },
      { label: 'Habitaciones', value: String(reservation.rooms) },
      { label: 'Precio total', value: `${reservation.totalPrice} ${reservation.currency}` },
    ];
  },
  executorKey: 'add_reservation_to_cart',
};
