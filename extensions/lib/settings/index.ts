export type {
  SegmentKey,
  PresetName,
  SettingsConfig,
  SettingsListItem,
  SettingsUpdateResult,
  SegmentMetadata,
} from "./types.js";

export { DEFAULT_SETTINGS, PRESETS, SEGMENT_METADATA, ZONE_VALUE_OPTIONS } from "./metadata.js";

export {
  createDefaultSettings,
  applyPreset,
  toggleSegment,
  setSegment,
  setZone,
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
