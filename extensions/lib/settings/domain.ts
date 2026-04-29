import { DEFAULT_SETTINGS, PRESETS } from "./metadata.js";
import type { PresetName, SegmentKey, SettingsConfig, SettingsUpdateResult } from "./types.js";

export function createDefaultSettings(): SettingsConfig {
  return structuredClone(DEFAULT_SETTINGS);
}

export function applyPreset(config: SettingsConfig, preset: PresetName): SettingsConfig {
  const next = structuredClone(config);
  next.preset = preset;
  const p = PRESETS[preset];
  for (const [key, val] of Object.entries(p) as [SegmentKey, boolean][]) {
    next.segments[key] = val;
  }
  return next;
}

export function toggleSegment(config: SettingsConfig, key: SegmentKey): SettingsConfig {
  const next = structuredClone(config);
  next.segments[key] = !next.segments[key];
  return next;
}

export function setSegment(
  config: SettingsConfig,
  key: SegmentKey,
  value: boolean,
): SettingsConfig {
  const next = structuredClone(config);
  next.segments[key] = value;
  return next;
}

export function setZone(
  config: SettingsConfig,
  key: "expert" | "warning",
  value: number,
): SettingsConfig {
  const next = structuredClone(config);
  next.contextZones[key] = Math.max(0, Math.min(100, value));
  // Ensure expert <= warning
  if (next.contextZones.expert > next.contextZones.warning) {
    if (key === "expert") {
      next.contextZones.warning = next.contextZones.expert;
    } else {
      next.contextZones.expert = next.contextZones.warning;
    }
  }
  return next;
}

export function validateSettings(raw: unknown): SettingsConfig {
  if (!raw || typeof raw !== "object") {
    return createDefaultSettings();
  }
  const r = raw as Record<string, unknown>;

  const preset = isPresetName(r.preset) ? r.preset : DEFAULT_SETTINGS.preset;
  const segments = validateSegments(r.segments);
  const contextZones = validateZones(r.contextZones);

  return { version: 1, preset, segments, contextZones };
}

export function migrateSettings(raw: unknown): SettingsConfig {
  const validated = validateSettings(raw);
  // If we ever need version migrations, add them here
  return validated;
}

export function updateSetting(
  config: SettingsConfig,
  id: string,
  value: string,
): SettingsUpdateResult {
  let next = structuredClone(config);
  const derivedUpdates: Array<{ id: string; value: string }> = [];

  switch (id) {
    case "preset": {
      if (isPresetName(value)) {
        next = applyPreset(next, value);
        for (const key of Object.keys(next.segments) as SegmentKey[]) {
          derivedUpdates.push({ id: key, value: next.segments[key] ? "true" : "false" });
        }
      }
      break;
    }
    case "modelThink":
    case "runtime":
    case "pwd":
    case "git":
    case "contextUsage":
    case "contextProgress":
    case "contextPercentage":
    case "contextNumbers":
    case "tokens":
    case "tps":
    case "cost": {
      next = setSegment(next, id, value === "true");
      // Context sub-toggle dependency: if contextUsage is turned off, children are hidden
      if (id === "contextUsage" && value === "false") {
        for (const child of [
          "contextProgress",
          "contextPercentage",
          "contextNumbers",
        ] as SegmentKey[]) {
          derivedUpdates.push({ id: child, value: "false" });
        }
      }
      break;
    }
    case "expertZone": {
      next = setZone(next, "expert", parseInt(value, 10));
      break;
    }
    case "warningZone": {
      next = setZone(next, "warning", parseInt(value, 10));
      break;
    }
  }

  return { config: next, derivedUpdates };
}

function isPresetName(v: unknown): v is PresetName {
  return v === "minimal" || v === "standard" || v === "verbose" || v === "performance";
}

function validateSegments(raw: unknown): Record<SegmentKey, boolean> {
  const segments = { ...DEFAULT_SETTINGS.segments };
  if (!raw || typeof raw !== "object") return segments;
  for (const [key, val] of Object.entries(raw)) {
    if (key in segments && typeof val === "boolean") {
      segments[key as SegmentKey] = val;
    }
  }
  return segments;
}

function validateZones(raw: unknown): { expert: number; warning: number } {
  const zones = { ...DEFAULT_SETTINGS.contextZones };
  if (!raw || typeof raw !== "object") return zones;
  const r = raw as Record<string, unknown>;

  if (typeof r.expert === "number") zones.expert = clamp(0, r.expert, 100);
  if (typeof r.warning === "number") zones.warning = clamp(0, r.warning, 100);

  // Ensure expert <= warning
  if (zones.expert > zones.warning) {
    const avg = Math.round((zones.expert + zones.warning) / 2);
    zones.expert = avg;
    zones.warning = avg;
  }

  return zones;
}

function clamp(min: number, val: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
