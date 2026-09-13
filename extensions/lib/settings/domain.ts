import { DEFAULT_SETTINGS, PRESETS } from "./metadata.js";
import type {
  ClockMode,
  PresetName,
  SegmentKey,
  SettingsConfig,
  SettingsUpdateResult,
} from "./types.js";

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

export function validateSettings(raw: unknown): SettingsConfig {
  if (!raw || typeof raw !== "object") {
    return createDefaultSettings();
  }
  const r = raw as Record<string, unknown>;

  const preset = isPresetName(r.preset) ? r.preset : DEFAULT_SETTINGS.preset;
  const segments = validateSegments(r.segments);
  const clockMode = isClockMode(r.clockMode)
    ? r.clockMode
    : getLegacyRuntimeEnabled(r.segments) === false
      ? "Off"
      : DEFAULT_SETTINGS.clockMode;
  const cacheWindowMinutes = validatePositiveNumber(
    r.cacheWindowMinutes,
    DEFAULT_SETTINGS.cacheWindowMinutes,
  );
  const contextTokenThresholds = validateContextTokenThresholds(r.contextTokenThresholds);
  const endOfRunNotification =
    typeof r.endOfRunNotification === "boolean"
      ? r.endOfRunNotification
      : DEFAULT_SETTINGS.endOfRunNotification;

  return {
    version: 1,
    preset,
    segments,
    clockMode,
    cacheWindowMinutes,
    contextTokenThresholds,
    endOfRunNotification,
  };
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
    case "clockMode": {
      if (isClockMode(value)) next.clockMode = value;
      break;
    }
    case "cacheWindowMinutes": {
      const minutes = parsePositiveNumber(value);
      if (minutes !== null) {
        next.cacheWindowMinutes = minutes;
      } else {
        derivedUpdates.push({ id, value: `${config.cacheWindowMinutes}` });
      }
      break;
    }
    case "contextYellowTokens": {
      const tokens = parseTokenCount(value);
      if (tokens !== null && tokens < next.contextTokenThresholds.red) {
        next.contextTokenThresholds.yellow = tokens;
      } else {
        derivedUpdates.push({ id, value: `${config.contextTokenThresholds.yellow}` });
      }
      break;
    }
    case "contextRedTokens": {
      const tokens = parseTokenCount(value);
      if (tokens !== null && tokens > next.contextTokenThresholds.yellow) {
        next.contextTokenThresholds.red = tokens;
      } else {
        derivedUpdates.push({ id, value: `${config.contextTokenThresholds.red}` });
      }
      break;
    }
    case "endOfRunNotification": {
      next.endOfRunNotification = value === "true";
      break;
    }
  }

  return { config: next, derivedUpdates };
}

function isClockMode(value: unknown): value is ClockMode {
  return value === "Runtime" || value === "Last Prompt" || value === "Off";
}

function getLegacyRuntimeEnabled(segments: unknown): boolean | undefined {
  if (!segments || typeof segments !== "object") return undefined;
  const runtime = (segments as Record<string, unknown>).runtime;
  return typeof runtime === "boolean" ? runtime : undefined;
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

function validateContextTokenThresholds(raw: unknown): { yellow: number; red: number } {
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_SETTINGS.contextTokenThresholds);
  }
  const { yellow, red } = raw as Record<string, unknown>;
  if (
    typeof yellow !== "number" ||
    typeof red !== "number" ||
    !Number.isFinite(yellow) ||
    !Number.isFinite(red) ||
    yellow <= 0 ||
    red <= yellow
  ) {
    return structuredClone(DEFAULT_SETTINGS.contextTokenThresholds);
  }
  return { yellow: Math.round(yellow), red: Math.round(red) };
}

function parsePositiveNumber(value: string): number | null {
  const number = Number(value.trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validatePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseTokenCount(value: string): number | null {
  const tokens = Number(value.replaceAll(",", "").replaceAll("_", ""));
  return Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : null;
}
