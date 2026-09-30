import type { ExtensionAPI, ExtensionContext, ThemeLike } from "./index.ts";

/**
 * Shimmer overlay for pi's stock working indicator.
 *
 * Stock pi renders the indicator as `${spinner} ${messageColorFn(message)}`
 * (pi-tui `Loader`): the default label is "Working" (`defaultWorkingMessage`
 * in `interactive-mode.js`), the default braille spinner ticks every 80 ms,
 * and the color function is the editor border color when the editor embeds
 * the working status (the default editor does), otherwise accent/muted.
 *
 * To stay identical to stock this extension never calls
 * `setWorkingIndicator()`: the spinner keeps its own frames, cadence and
 * color logic, including the thinking-level border color path. The shimmer is
 * layered on top of the stock label through `setWorkingMessage()` and is
 * weight-only (`bold`), so the color stock applied to the label is preserved
 * for every character.
 */

/** Stock default working label (`defaultWorkingMessage`). */
const WORKING_LABEL = "Working";

/** Matches the stock spinner cadence (`Loader.DEFAULT_INTERVAL_MS`). */
const SHIMMER_INTERVAL_MS = 80;

/** Characters covered by the highlight window. */
const HIGHLIGHT_WIDTH = 3;

const LABEL_LENGTH = Array.from(WORKING_LABEL).length;

function getHighlightWidth(labelLength: number): number {
  return Math.max(1, Math.min(HIGHLIGHT_WIDTH, labelLength));
}

function getSweepWindow(
  labelLength: number,
  step: number,
): {
  start: number;
  end: number;
} {
  const highlightWidth = getHighlightWidth(labelLength);
  const cycleLength = labelLength + highlightWidth;
  const start = (step % cycleLength) - highlightWidth;

  return {
    start,
    end: start + highlightWidth,
  };
}

/**
 * Renders the stock label with a highlight window sweeping across it. Only the
 * window is styled: the rest of the label stays unstyled so the color function
 * stock wraps the whole message with keeps applying to it.
 */
function renderShimmerLabel(
  theme: ThemeLike,
  label: string,
  step: number,
): string {
  const characters = Array.from(label);
  if (characters.length === 0) return "";

  const { start, end } = getSweepWindow(characters.length, step);
  const from = Math.max(0, start);
  const to = Math.min(characters.length, end);
  const before = characters.slice(0, from).join("");
  const highlighted = characters.slice(from, to).join("");
  const after = characters.slice(to).join("");

  return before + (highlighted ? theme.bold(highlighted) : "") + after;
}

/**
 * `setWorkingMessage()` is a no-op outside the TUI, so the timer is only worth
 * running there. An unknown mode is treated as interactive.
 */
function isInteractiveUi(ctx: ExtensionContext): boolean {
  return ctx.mode === undefined || ctx.mode === "tui";
}

export function installWorkingIndicatorShimmer(pi: ExtensionAPI): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;

  const stop = (ctx: ExtensionContext): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }

    // Restore the stock label (`defaultWorkingMessage`).
    if (isInteractiveUi(ctx)) {
      ctx.ui.setWorkingMessage();
    }
  };

  const start = (ctx: ExtensionContext): void => {
    if (!isInteractiveUi(ctx)) return;
    if (timer !== undefined) clearInterval(timer);

    const { ui } = ctx;
    const cycleLength = LABEL_LENGTH + getHighlightWidth(LABEL_LENGTH);
    const tick = (): void => {
      ui.setWorkingMessage(renderShimmerLabel(ui.theme, WORKING_LABEL, step));
      step = (step + 1) % cycleLength;
    };

    step = 0;
    tick();
    timer = setInterval(tick, SHIMMER_INTERVAL_MS);
  };

  pi.on("agent_start", (_event, ctx) => {
    start(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    stop(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stop(ctx);
  });
}
