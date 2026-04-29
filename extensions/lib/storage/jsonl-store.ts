import type { JsonlStore, RawBackend } from "./types.js";

export function createJsonlStore<T>(backend: RawBackend, name: string): JsonlStore<T> {
  const fileName = `${name}.jsonl`;

  return {
    async append(value: T): Promise<void> {
      const line = JSON.stringify(value);
      await backend.append(fileName, line);
    },

    async read(options?: { last?: number }): Promise<T[]> {
      const lines = await backend.readLines(fileName, options);
      const results: T[] = [];
      for (const line of lines) {
        try {
          results.push(JSON.parse(line) as T);
        } catch (err) {
          console.error(`[storage] corrupt JSONL line in ${fileName}, skipping:`, err);
        }
      }
      return results;
    },

    async trim(options: { keepLast: number }): Promise<void> {
      await backend.trimLines(fileName, options.keepLast);
    },
  };
}
