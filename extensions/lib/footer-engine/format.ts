import { homedir } from "node:os";
import type { ThemeColor } from "@mariozechner/pi-coding-agent";

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function shortenPath(p: string): string {
  const home = homedir();
  if (home && p.startsWith(home)) return p.replace(home, "~");
  return p;
}

export function thinkingColor(level: string): ThemeColor {
  switch (level) {
    case "off":
      return "thinkingOff";
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    default:
      return "thinkingOff";
  }
}

export function contextUsageColor(pct: number, expert: number, warning: number): ThemeColor {
  if (pct <= expert) return "success";
  if (pct <= warning) return "warning";
  return "error";
}

export function rainbowText(text: string): string {
  const colors = [
    "\x1b[38;2;255;0;0m", // red
    "\x1b[38;2;255;127;0m", // orange
    "\x1b[38;2;255;255;0m", // yellow
    "\x1b[38;2;0;255;0m", // green
    "\x1b[38;2;0;255;255m", // cyan
    "\x1b[38;2;0;0;255m", // blue
    "\x1b[38;2;255;0;255m", // magenta
  ];
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += colors[i % colors.length] + text[i];
  }
  result += "\x1b[0m";
  return result;
}
