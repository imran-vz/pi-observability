import { Input } from "@earendil-works/pi-tui";
import { SEGMENT_METADATA } from "./metadata.js";
import type { SettingsConfig, SettingsListItem } from "./types.js";

function numberInput(currentValue: string, done: (selectedValue?: string) => void): Input {
  const input = new Input({ prompt: "Value: " });
  input.setValue(currentValue);
  input.focused = true;
  input.onSubmit = (value) => done(value.trim());
  input.onEscape = () => done();
  return input;
}

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
      id: "clockMode",
      label: "Clock",
      description: "Show session runtime, time since the last model request, or nothing",
      currentValue: config.clockMode,
      values: ["Runtime", "Last Prompt", "Off"],
    },
    {
      id: "cacheWindowMinutes",
      label: "Prompt Cache Window",
      description: "Minutes before the Last Prompt clock turns red",
      currentValue: `${config.cacheWindowMinutes}`,
      submenu: numberInput,
    },
    {
      id: "endOfRunNotification",
      label: "End-of-Run TPS Notification",
      description: "Show a TPS summary notification after each agent run",
      currentValue: config.endOfRunNotification ? "true" : "false",
      values: ["true", "false"],
    },
    {
      id: "contextYellowTokens",
      label: "Yellow Context Limit",
      description: "Context token count where the footer turns yellow",
      currentValue: `${config.contextTokenThresholds.yellow}`,
      submenu: numberInput,
    },
    {
      id: "contextRedTokens",
      label: "Red Context Limit",
      description: "Context token count where the footer turns red",
      currentValue: `${config.contextTokenThresholds.red}`,
      submenu: numberInput,
    },
  );

  return items;
}
