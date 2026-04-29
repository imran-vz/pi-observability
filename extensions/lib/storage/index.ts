export { createJsonStore } from "./json-store.js";
export { createJsonlStore } from "./jsonl-store.js";
export { createFileBackend, type FileBackendOptions } from "./file-backend.js";
export { createMemoryBackend } from "./memory-backend.js";
export type { JsonStore, JsonlStore, Storage, RawBackend } from "./types.js";

import { createJsonStore } from "./json-store.js";
import { createJsonlStore } from "./jsonl-store.js";
import type { Storage, RawBackend } from "./types.js";

export function createStorage(backend: RawBackend): Storage {
  return {
    json<T>(name: string, options?: { defaults?: T }) {
      return createJsonStore(backend, name, options);
    },
    jsonl(name: string) {
      return createJsonlStore(backend, name);
    },
  };
}

import { createFileBackend } from "./file-backend.js";
import { createMemoryBackend } from "./memory-backend.js";

export function createFileStorage(options: { dir: string }): Storage {
  const backend = createFileBackend(options);
  return createStorage(backend);
}

export function createMemoryStorage(): Storage {
  const backend = createMemoryBackend();
  return createStorage(backend);
}
