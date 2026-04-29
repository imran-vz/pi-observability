import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import type { LayoutAssembler } from "./types.js";

export const defaultAssembler: LayoutAssembler = (segments, width, theme) => {
  const sep = " " + theme.fg("dim", "▸") + " ";

  const leftParts = [segments["modelThink"]].filter(Boolean);
  const rightParts = [
    segments["contextUsage"],
    segments["tokens"],
    segments["tps"],
    segments["cost"],
  ].filter(Boolean);
  const middleParts = [segments["runtime"], segments["pwd"], segments["git"]].filter(Boolean);

  const leftStr = leftParts.join(sep);
  const rightStr = rightParts.join(sep);
  const middleStr = middleParts.join(sep);

  const singleLine = middleStr
    ? leftStr + sep + middleStr + sep + rightStr
    : leftStr + sep + rightStr;

  if (visibleWidth(singleLine) <= width) {
    const pad = width - visibleWidth(singleLine);
    return [singleLine + " ".repeat(Math.max(0, pad))];
  }

  // Fallback: two lines
  function fitLine(parts: string[]): string {
    const line = parts.filter(Boolean).join(sep);
    const w = visibleWidth(line);
    if (w < width) return line + " ".repeat(width - w);
    if (w > width) return truncateToWidth(line, width);
    return line;
  }

  const line1 = fitLine([segments["modelThink"], segments["pwd"], segments["git"]]);
  const line2 = fitLine([
    segments["runtime"],
    segments["contextUsage"],
    segments["tokens"],
    segments["tps"],
    segments["cost"],
  ]);
  return [line1, line2];
};
