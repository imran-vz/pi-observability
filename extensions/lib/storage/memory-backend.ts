import type { RawBackend } from "./types.js";

export function createMemoryBackend(initial?: Map<string, string>): RawBackend {
  const store = initial ?? new Map<string, string>();

  return {
    async read(name) {
      return store.get(name);
    },

    async write(name, content) {
      store.set(name, content);
    },

    async append(name, line) {
      const existing = store.get(name) ?? "";
      store.set(name, `${existing}${line}\n`);
    },

    async readLines(name, options) {
      const text = store.get(name);
      if (!text) return [];
      const lines = text.split("\n").filter((l) => l.trim());
      if (options?.last !== undefined && options.last > 0) {
        return lines.slice(-options.last);
      }
      return lines;
    },

    async trimLines(name, keepLast) {
      const lines = await this.readLines(name);
      if (lines.length <= keepLast) return;
      const kept = lines.slice(-keepLast);
      store.set(name, kept.map((l) => `${l}\n`).join(""));
    },
  };
}
