import { loadSettings, saveSettings } from "./storage.js";
import {
  applyPreset,
  toggleSegment,
  setSegment,
  setZone,
  createDefaultSettings,
} from "./domain.js";
import type { PresetName, SegmentKey, SettingsConfig } from "./types.js";
import type { Storage } from "../storage/index.js";

export interface SettingsManager {
  load(): Promise<void>;
  save(): Promise<void>;
  getConfig(): SettingsConfig;
  applyPreset(preset: PresetName): SettingsConfig;
  toggleSegment(key: SegmentKey): SettingsConfig;
  setSegment(key: SegmentKey, value: boolean): SettingsConfig;
  setZone(key: "expert" | "warning", value: number): SettingsConfig;
}

export function createSettingsManager(storage: Storage): SettingsManager {
  let config: SettingsConfig = createDefaultSettings();

  return {
    async load() {
      config = await loadSettings(storage);
    },

    async save() {
      await saveSettings(config, storage);
    },

    getConfig() {
      return structuredClone(config);
    },

    applyPreset(preset) {
      config = applyPreset(config, preset);
      return structuredClone(config);
    },

    toggleSegment(key) {
      config = toggleSegment(config, key);
      return structuredClone(config);
    },

    setSegment(key, value) {
      config = setSegment(config, key, value);
      return structuredClone(config);
    },

    setZone(key, value) {
      config = setZone(config, key, value);
      return structuredClone(config);
    },
  };
}
