import { basename } from "node:path";
import type { SegmentRenderer } from "./types.js";
import { fmtDuration, fmtTokens, shortenPath, thinkingColor, rainbowText } from "./format.js";

export const builtinRenderers: Record<string, SegmentRenderer> = {
  modelThink(input) {
    const { model, thinkingLevel, fastModeEnabled, serviceTier, theme } = input;
    const text = `${model}:${thinkingLevel}`;
    const tier = fastModeEnabled ? theme.fg("accent", ` ⚡${serviceTier ?? "fast"}`) : "";
    if (thinkingLevel === "xhigh" || thinkingLevel === "max") {
      return rainbowText(text) + tier;
    }
    return theme.fg(thinkingColor(thinkingLevel), text) + tier;
  },

  runtime(input) {
    if (input.settings.clockMode === "Off") return "";
    if (input.settings.clockMode === "Runtime") {
      return input.theme.fg("dim", `⏱ ${fmtDuration(input.runtimeMs)}`);
    }
    if (input.lastProviderRequestTime === null) {
      return input.theme.fg("dim", "⏱ --");
    }

    const elapsed = Date.now() - input.lastProviderRequestTime;
    const cacheWindowMs = input.settings.cacheWindowMinutes * 60_000;
    return input.theme.fg(elapsed >= cacheWindowMs ? "error" : "dim", `⏱ ${fmtDuration(elapsed)}`);
  },

  pwd(input) {
    const path = input.showFullPath ? shortenPath(input.cwd) : basename(input.cwd);
    return input.theme.fg("dim", `📁 ${path}`);
  },

  git(input) {
    const { gitBranch, gitDiffAdded, gitDiffRemoved, theme } = input;
    if (!gitBranch) return "";
    let text = theme.fg("dim", ` ${gitBranch}`);
    if (gitDiffAdded > 0 || gitDiffRemoved > 0) {
      text += ` ${theme.fg("success", `+${gitDiffAdded}`)} ${theme.fg("error", `-${gitDiffRemoved}`)}`;
    }
    return text;
  },

  contextUsage(input) {
    const { contextUsage, theme, settings } = input;
    if (!contextUsage || !contextUsage.contextWindow) return "";

    const tokens = contextUsage.tokens || 0;
    const max = contextUsage.contextWindow;
    const pct = Math.min(100, Math.max(0, Math.round((tokens / max) * 100)));

    let text = "ctx";

    if (settings.segments.contextProgress) {
      const barWidth = 10;
      const filled = Math.round((pct / 100) * barWidth);
      const empty = barWidth - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      text += ` [${bar}]`;
    }

    if (settings.segments.contextPercentage) {
      text += ` ${pct}%`;
    }

    if (settings.segments.contextNumbers) {
      text += ` ${fmtTokens(tokens)}/${fmtTokens(max)}`;
    }

    const color =
      tokens >= settings.contextTokenThresholds.red
        ? "error"
        : tokens >= settings.contextTokenThresholds.yellow
          ? "warning"
          : "success";

    return theme.fg(color, text);
  },

  tokens(input) {
    const { totalInputTokens, totalOutputTokens, theme } = input;
    return theme.fg("dim", `↑${fmtTokens(totalInputTokens)} ↓${fmtTokens(totalOutputTokens)}`);
  },

  tps(input) {
    const { isStreaming, currentTurnStartTime, currentTurnUpdateCount, lastTurnTps, theme } = input;
    if (isStreaming && currentTurnStartTime) {
      const elapsed = (Date.now() - currentTurnStartTime) / 1000;
      const liveTps = elapsed > 0 ? currentTurnUpdateCount / elapsed : 0;
      return theme.fg("accent", `⚡${liveTps.toFixed(1)}`);
    } else if (lastTurnTps > 0) {
      return theme.fg("dim", `⚡${lastTurnTps.toFixed(1)}`);
    }
    return "";
  },

  cost(input) {
    const { totalCost, theme } = input;
    return theme.fg("dim", `$${totalCost.toFixed(4)}`);
  },
};
