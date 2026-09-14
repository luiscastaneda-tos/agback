import { z } from 'zod';

import type { ToolDefinition } from './tool-definition';

const argsSchema = z.strictObject({
  cartItemId: z.string(),
  travelerId: z.string(),
  travelerName: z.string(),
  totalPrice: z.number().finite().positive(),
  currency: z.string(),
});

export const confirmBookingDefinition: ToolDefinition = {
  name: 'confirm_booking',
  description: 'Confirm a fictional booking using the mock adapter.',
  argsSchema,
  actionVersion: 1,
  // D-020 fallback: include travelerName because this definition has no trusted name derivation.
  materialFields: ['cartItemId', 'travelerId', 'totalPrice', 'currency', 'travelerName'],
  toPreview: (args) => {
    const booking = argsSchema.parse(args);
    return [
      { label: 'Ítem de carrito', value: booking.cartItemId },
      { label: 'Huésped', value: booking.travelerName },
      {
        label: 'Total a pagar',
        value: `${booking.totalPrice} ${booking.currency}`,
        emphasis: 'warning',
      },
    ];
  },
  executorKey: 'confirm_booking',
};
