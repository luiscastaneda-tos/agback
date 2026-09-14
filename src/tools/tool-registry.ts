import { toJSONSchema } from 'zod';

import { addReservationToCartDefinition } from './definitions/add-reservation-to-cart';
import { searchHotelsDefinition } from './definitions/search-hotels';
import type { ToolDefinition } from './definitions/tool-definition';
import type { ToolHandle } from './tool-handle';

export class ToolRegistry {
  private readonly entries = new Map<string, {
    definition: ToolDefinition;
    handle: ToolHandle;
  }>();

  constructor() {
    this.register(searchHotelsDefinition);
    this.register(addReservationToCartDefinition);
  }

  register(definition: ToolDefinition): void {
    if (this.entries.has(definition.name)) {
      throw new Error('Tool is already registered.');
    }

    const stored = this.copyDefinition(definition);
    // Convert before inserting: unsupported schemas leave the registry unchanged.
    // Snapshot the JSON data so later schema metadata changes cannot affect handles.
    const handle: ToolHandle = {
      name: stored.name,
      description: stored.description,
      argsSchema: JSON.parse(JSON.stringify(toJSONSchema(stored.argsSchema, {
        io: 'input',
        unrepresentable: 'throw',
      }))),
    };
    this.entries.set(stored.name, { definition: stored, handle });
  }

  /** Internal lookup for the future ToolInvoker, never an agent-facing API. */
  getDefinition(name: string): ToolDefinition | undefined {
    const entry = this.entries.get(name);
    return entry === undefined ? undefined : this.copyDefinition(entry.definition);
  }

  getHandle(name: string): ToolHandle | undefined {
    const entry = this.entries.get(name);
    return entry === undefined ? undefined : this.copyHandle(entry.handle);
  }

  listHandles(): ToolHandle[] {
    return Array.from(this.entries.values(), ({ handle }) => this.copyHandle(handle));
  }

  private copyDefinition(definition: ToolDefinition): ToolDefinition {
    return {
      name: definition.name,
      description: definition.description,
      argsSchema: definition.argsSchema,
      actionVersion: definition.actionVersion,
      materialFields: [...definition.materialFields],
      toPreview: definition.toPreview,
      executorKey: definition.executorKey,
    };
  }

  private copyHandle(handle: ToolHandle): ToolHandle {
    return {
      name: handle.name,
      description: handle.description,
      argsSchema: structuredClone(handle.argsSchema),
    };
  }
}
