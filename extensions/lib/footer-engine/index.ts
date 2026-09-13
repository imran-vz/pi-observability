export type {
  SegmentKey,
  FooterSettings,
  FooterInput,
  SegmentRenderer,
  LayoutAssembler,
  FooterEngineOptions,
} from "./types.js";

export { fmtDuration, fmtTokens, shortenPath, thinkingColor, rainbowText } from "./format.js";

export { builtinRenderers } from "./segments.js";
export { defaultAssembler } from "./layout.js";

import { builtinRenderers } from "./segments.js";
import { defaultAssembler } from "./layout.js";
import type { FooterInput, FooterEngineOptions } from "./types.js";

export function renderFooter(input: FooterInput, width: number): string[] {
  const segments: Record<string, string> = {};
  for (const [key, renderer] of Object.entries(builtinRenderers)) {
    const enabled =
      key === "runtime"
        ? input.settings.clockMode !== "Off"
        : input.settings.segments[key as keyof FooterInput["settings"]["segments"]];
    if (enabled) {
      segments[key] = renderer(input);
    } else {
      segments[key] = "";
    }
  }
  return defaultAssembler(segments, width, input.theme);
}

export function createFooterEngine(options: FooterEngineOptions) {
  const segmentRenderers = { ...builtinRenderers, ...options.segments };
  const assembler = options.layout ?? defaultAssembler;

  return {
    render(input: FooterInput, width: number): string[] {
      const segments: Record<string, string> = {};
      for (const [key, renderer] of Object.entries(segmentRenderers)) {
        const enabled =
          key === "runtime"
            ? input.settings.clockMode !== "Off"
            : input.settings.segments[key as keyof FooterInput["settings"]["segments"]];
        if (enabled) {
          segments[key] = renderer(input);
        } else {
          segments[key] = "";
        }
      }
      return assembler(segments, width, input.theme);
    },
  };
}
