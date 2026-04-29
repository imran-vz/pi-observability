import { SEGMENT_METADATA, ZONE_VALUE_OPTIONS } from "./metadata.js";
import type { SettingsConfig, SettingsListItem } from "./types.js";

export function toSettingsListItems(config: SettingsConfig): SettingsListItem[] {
  const items: SettingsListItem[] = [
    {
      id: "preset",
      label: "Layout Preset",
      description:
        "Quick layout presets. Individual segments can still be toggled after applying a preset.",
      currentValue: config.preset,
      values: ["minimal", "standard", "verbose", "performance"],
    },
  ];

  for (const meta of SEGMENT_METADATA) {
    items.push({
      id: meta.id,
      label: meta.label,
      description: meta.description,
      currentValue: config.segments[meta.id] ? "true" : "false",
      values: ["true", "false"],
    });
  }

  items.push(
    {
      id: "expertZone",
      label: "Expert Zone Threshold",
      description: "Context usage percentage where the bar turns green (0-100)",
      currentValue: `${config.contextZones.expert}`,
      values: ZONE_VALUE_OPTIONS.expert,
    },
    {
      id: "warningZone",
      label: "Warning Zone Threshold",
      description: "Context usage percentage where the bar turns yellow (0-100)",
      currentValue: `${config.contextZones.warning}`,
      values: ZONE_VALUE_OPTIONS.warning,
    },
  );

  return items;
}
