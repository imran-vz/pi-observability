export type {
  SegmentKey,
  PresetName,
  SettingsConfig,
  SettingsListItem,
  SettingsUpdateResult,
  SegmentMetadata,
} from "./types.js";

export { DEFAULT_SETTINGS, PRESETS, SEGMENT_METADATA } from "./metadata.js";

export {
  createDefaultSettings,
  applyPreset,
  toggleSegment,
  setSegment,
  validateSettings,
  migrateSettings,
  updateSetting,
} from "./domain.js";

export { toSettingsListItems } from "./tui.js";

export {
  createSettingsStorage,
  createMemorySettingsStorage,
  loadSettings,
  saveSettings,
} from "./storage.js";

export { createSettingsManager, type SettingsManager } from "./manager.js";
