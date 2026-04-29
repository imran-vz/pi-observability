import type { PresetName, SegmentKey, SegmentMetadata, SettingsConfig } from "./types.js";

export const DEFAULT_SETTINGS: SettingsConfig = {
  version: 1,
  preset: "standard",
  segments: {
    modelThink: true,
    runtime: true,
    pwd: true,
    git: true,
    contextUsage: true,
    contextProgress: true,
    contextPercentage: true,
    contextNumbers: true,
    tokens: true,
    tps: true,
    cost: true,
  },
  contextZones: { expert: 70, warning: 85 },
};

export const PRESETS: Record<PresetName, Partial<Record<SegmentKey, boolean>>> = {
  minimal: {
    modelThink: true,
    contextUsage: true,
    contextProgress: true,
    contextPercentage: false,
    contextNumbers: true,
    runtime: false,
    pwd: false,
    git: false,
    tokens: false,
    tps: false,
    cost: false,
  },
  standard: {
    modelThink: true,
    runtime: true,
    pwd: true,
    git: true,
    contextUsage: true,
    contextProgress: true,
    contextPercentage: true,
    contextNumbers: true,
    tokens: true,
    tps: false,
    cost: true,
  },
  verbose: {
    modelThink: true,
    runtime: true,
    pwd: true,
    git: true,
    contextUsage: true,
    contextProgress: true,
    contextPercentage: true,
    contextNumbers: true,
    tokens: true,
    tps: true,
    cost: true,
  },
  performance: {
    modelThink: true,
    runtime: false,
    pwd: false,
    git: false,
    contextUsage: true,
    contextProgress: false,
    contextPercentage: true,
    contextNumbers: true,
    tokens: false,
    tps: true,
    cost: true,
  },
};

export const SEGMENT_METADATA: SegmentMetadata[] = [
  {
    id: "modelThink",
    label: "Model & Thinking",
    description: "Show current model and thinking level",
  },
  { id: "runtime", label: "Runtime", description: "Show session runtime timer" },
  { id: "pwd", label: "Working Directory", description: "Show current working directory" },
  { id: "git", label: "Git Branch & Diff", description: "Show git branch and diff stats" },
  {
    id: "contextUsage",
    label: "Context Usage",
    description: "Master toggle for the context usage segment",
  },
  {
    id: "contextProgress",
    label: "  └ Progress Bar",
    description: "Show the progress bar in context usage",
  },
  {
    id: "contextPercentage",
    label: "  └ Percentage",
    description: "Show the percentage in context usage",
  },
  {
    id: "contextNumbers",
    label: "  └ Used / Total",
    description: "Show the token count in context usage",
  },
  { id: "tokens", label: "Session Tokens", description: "Show total input/output token counts" },
  { id: "tps", label: "TPS (Tokens/Sec)", description: "Show live and last-turn TPS" },
  { id: "cost", label: "Cost", description: "Show estimated session cost" },
];

export const ZONE_VALUE_OPTIONS = {
  expert: ["60", "65", "70", "75", "80"],
  warning: ["75", "80", "85", "90", "95"],
};
