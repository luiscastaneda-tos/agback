/** Canonical JSON for plain JSON data; never calls getters or toJSON hooks. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();

  function encode(input: unknown): string {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') {
      return JSON.stringify(input);
    }
    if (typeof input === 'number' && Number.isFinite(input)) {
      return JSON.stringify(input);
    }
    if (typeof input !== 'object' || input === null || ancestors.has(input)) {
      throw new Error('Unsupported JSON data.');
    }

    const array = Array.isArray(input);
    const prototype: unknown = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) {
      throw new Error('Unsupported JSON data.');
    }

    ancestors.add(input);
    try {
      const keys = Reflect.ownKeys(input);
      const values = new Map<string, unknown>();
      for (const key of keys) {
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (typeof key !== 'string' || !descriptor?.enumerable ||
            !Object.hasOwn(descriptor, 'value')) {
          throw new Error('Unsupported JSON data.');
        }
        values.set(key, descriptor.value);
      }

      if (array) {
        // Holes and extra properties must not disappear during serialization.
        if (values.size !== input.length) throw new Error('Unsupported JSON data.');
        const items: string[] = [];
        for (let index = 0; index < input.length; index += 1) {
          const key = String(index);
          if (!values.has(key)) throw new Error('Unsupported JSON data.');
          items.push(encode(values.get(key)));
        }
        return `[${items.join(',')}]`;
      }

      // Sort strings directly, independent of locale and integer-key enumeration.
      return `{${[...values.keys()].sort().map((key) =>
        `${JSON.stringify(key)}:${encode(values.get(key))}`,
      ).join(',')}}`;
    } finally {
      ancestors.delete(input);
    }
  }

  try {
    return encode(value);
  } catch {
    // Also redact reflection failures (for example, a throwing Proxy trap).
    throw new Error('Unsupported JSON data.');
  }
}
