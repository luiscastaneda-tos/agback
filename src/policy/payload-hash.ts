import { createHash } from 'node:crypto';

import type { ToolDefinition } from '../tools/definitions/tool-definition';
import { canonicalJson } from './canonical-json';

type HashMetadata = Readonly<Pick<ToolDefinition, 'name' | 'actionVersion' | 'materialFields'>>;

/** Hash only declared material from schema-validated arguments, bound to its task. */
export function payloadHash(
  definition: HashMetadata,
  args: Readonly<Record<string, unknown>>,
  context: Readonly<{ conversationId: string; taskId: string }>,
): string {
  try {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new Error('Invalid approval hash input.');
    }
    const material: Record<string, unknown> = Object.create(null);
    for (const field of definition.materialFields) {
      if (typeof field !== 'string') throw new Error('Invalid approval hash input.');
      const descriptor = Object.getOwnPropertyDescriptor(args, field);
      if (descriptor === undefined) continue;
      if (!Object.hasOwn(descriptor, 'value')) {
        throw new Error('Invalid approval hash input.');
      }
      material[field] = descriptor.value;
    }

    const serialized = canonicalJson({
      action: definition.name,
      actionVersion: definition.actionVersion,
      conversationId: context.conversationId,
      taskId: context.taskId,
      material,
    });
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
  } catch {
    throw new Error('Invalid approval hash input.');
  }
}
