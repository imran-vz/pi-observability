import { homedir } from "node:os";
import { join } from "node:path";
import {
  createFileBackend,
  createMemoryBackend,
  createStorage,
  type Storage,
} from "../storage/index.js";
import { migrateSettings } from "./domain.js";
import type { SettingsConfig } from "./types.js";

const DEFAULT_DIR = join(homedir(), ".pi", "agent", "observability");

export function createSettingsStorage(options?: { dir?: string }): Storage {
  const dir = options?.dir ?? DEFAULT_DIR;
  const backend = createFileBackend({ dir });
  return createStorage(backend);
}

export function createMemorySettingsStorage(): Storage {
  const backend = createMemoryBackend();
  return createStorage(backend);
}

export async function loadSettings(storage: Storage): Promise<SettingsConfig> {
  const store = storage.json<SettingsConfig>("settings", { defaults: undefined });
  try {
    const raw = await store.load();
    return migrateSettings(raw);
  } catch {
    return migrateSettings(undefined);
  }
}

export async function saveSettings(config: SettingsConfig, storage: Storage): Promise<void> {
  const store = storage.json<SettingsConfig>("settings");
  await store.save(config);
}
