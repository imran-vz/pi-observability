import type { JsonStore, RawBackend } from "./types.js";

export function createJsonStore<T>(
  backend: RawBackend,
  name: string,
  options?: { defaults?: T },
): JsonStore<T> {
  const fileName = `${name}.json`;
  const defaults = options?.defaults;

  return {
    async load(): Promise<T> {
      const text = await backend.read(fileName);
      if (text === undefined) {
        if (defaults !== undefined) return defaults;
        throw new Error(`Missing file and no defaults for ${fileName}`);
      }
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        console.error(`[storage] corrupt JSON in ${fileName}, using defaults:`, err);
        if (defaults !== undefined) return defaults;
        throw err;
      }
    },

    async save(value: T): Promise<void> {
      const text = JSON.stringify(value, null, 2);
      await backend.write(fileName, text);
    },
  };
}
