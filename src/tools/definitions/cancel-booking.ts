import { z } from 'zod';

import type { ToolDefinition } from './tool-definition';

const argsSchema = z.strictObject({
  bookingId: z.string(),
  travelerId: z.string(),
  travelerName: z.string(),
  reason: z.string().optional(),
}).transform((booking) => {
  // The material hash skips absent properties but rejects undefined values.
  if (booking.reason === undefined) delete booking.reason;
  return booking;
});

export const cancelBookingDefinition: ToolDefinition = {
  name: 'cancel_booking',
  description: 'Cancel a fictional booking using the mock adapter.',
  argsSchema,
  actionVersion: 1,
  materialFields: ['bookingId', 'travelerId', 'reason'],
  toPreview: (args) => {
    const booking = argsSchema.parse(args);
    return [
      { label: 'ID de reserva', value: booking.bookingId },
      { label: 'Huésped', value: booking.travelerName },
      { label: 'Motivo de cancelación', value: booking.reason ?? 'No especificado' },
    ];
  },
  executorKey: 'cancel_booking',
};
