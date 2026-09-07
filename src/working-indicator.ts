import type { ExtensionAPI, ExtensionUIContext, ThemeLike } from "./index.ts";

const WORKING_LABEL = "Working…";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SHIMMER_INTERVAL_MS = 60;
const HIGHLIGHT_WIDTH_RATIO = 0.28;
const HIGHLIGHT_MAX_WIDTH = 5;

function getHighlightWidth(textLength: number): number {
  return Math.max(
    1,
    Math.min(
      HIGHLIGHT_MAX_WIDTH,
      Math.ceil(textLength * HIGHLIGHT_WIDTH_RATIO),
    ),
  );
}

function getSweepWindow(
  textLength: number,
  animationFrame: number,
): {
  start: number;
  end: number;
} {
  const highlightWidth = getHighlightWidth(textLength);
  const start =
    (animationFrame % (textLength + highlightWidth)) - highlightWidth;

  return {
    start,
    end: start + highlightWidth,
  };
}

function styleWorkingText(theme: ThemeLike, text: string): string {
  return text ? theme.fg("muted", text) : text;
}

function highlightWorkingText(theme: ThemeLike, text: string): string {
  return text ? theme.bold(theme.fg("accent", text)) : text;
}

function animateWorkingLabel(
  theme: ThemeLike,
  label: string,
  animationFrame: number,
): string {
  const characters = Array.from(label);
  if (characters.length === 0) return "";

  const { start, end } = getSweepWindow(characters.length, animationFrame);
  const before = characters.slice(0, Math.max(0, start)).join("");
  const highlighted = characters
    .slice(Math.max(0, start), Math.min(characters.length, end))
    .join("");
  const after = characters.slice(Math.max(0, end)).join("");

  return (
    styleWorkingText(theme, before) +
    highlightWorkingText(theme, highlighted) +
    styleWorkingText(theme, after)
  );
}

function buildShimmerFrames(ui: ExtensionUIContext): string[] {
  const labelLength = Array.from(WORKING_LABEL).length;
  const animationCycle = labelLength + getHighlightWidth(labelLength);
  const frameCount = SPINNER_FRAMES.length * animationCycle;

  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const spinnerFrame =
      SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
    const spinner = ui.theme.fg("accent", spinnerFrame);
    const shimmerLabel = animateWorkingLabel(
      ui.theme,
      WORKING_LABEL,
      frameIndex,
    );

    return `${spinner} ${shimmerLabel}`;
  });
}

function applyShimmerIndicator(ui: ExtensionUIContext): void {
  ui.setWorkingIndicator({
    frames: buildShimmerFrames(ui),
    intervalMs: SHIMMER_INTERVAL_MS,
  });

  ui.setWorkingMessage("");
}

function restoreDefaultIndicator(ui: ExtensionUIContext): void {
  ui.setWorkingIndicator();
  ui.setWorkingMessage();
}

export function installWorkingIndicatorShimmer(pi: ExtensionAPI): void {
  pi.on("agent_start", (_event, ctx) => {
    applyShimmerIndicator(ctx.ui);
  });

  pi.on("agent_end", (_event, ctx) => {
    restoreDefaultIndicator(ctx.ui);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    restoreDefaultIndicator(ctx.ui);
  });
}
