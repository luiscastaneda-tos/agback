import { z } from 'zod';

import type { ToolDefinition } from './tool-definition';

const argsSchema = z.strictObject({
  destination: z.string().trim().min(1),
});

export const searchHotelsDefinition: ToolDefinition = {
  name: 'search_hotels',
  description: 'Search fictional hotels by destination using the mock adapter.',
  argsSchema,
  actionVersion: 1,
  materialFields: ['destination'],
  toPreview: (args) => {
    const { destination } = argsSchema.parse(args);
    return [{ label: 'Destination', value: destination }];
  },
  executorKey: 'search_hotels',
};
