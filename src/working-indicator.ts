import type {
  ExtensionAPI,
  ExtensionContext,
  ThemeLike,
  TuiLike,
} from "./index.ts";

/**
 * Shimmer overlay for pi's stock working and compaction indicators.
 *
 * Stock pi renders indicators as `${spinner} ${messageColorFn(message)}`
 * (pi-tui `Loader`):
 * - The default streaming label is "Working" (`defaultWorkingMessage` in
 *   `interactive-mode.js`), the default braille spinner ticks every 80 ms,
 *   and the color function is the editor border color when the editor embeds
 *   the working status (the default editor does), otherwise accent/muted.
 * - The compaction indicator is `Compacting context... (escape to cancel)`
 *   (or `Auto-compacting... (escape to cancel)`), also rendered via a `Loader`.
 *
 * To stay identical to stock this extension never calls `setWorkingIndicator()`:
 * the spinner keeps its own frames, cadence and color logic, including the
 * thinking-level border color path. The shimmer is layered on top of the stock
 * label through `setWorkingMessage()` or direct indicator message updates and is
 * weight-only (`bold`), so the color stock applied to the label is preserved
 * for every character. The only addition to the stock text is a parenthesized
 * elapsed-time suffix, like stock's own `Working (esc to interrupt)` suffix.
 */

/** Stock default working label (`defaultWorkingMessage`). */
export const WORKING_LABEL = "Working";

/** Matches the stock spinner cadence (`Loader.DEFAULT_INTERVAL_MS`). */
export const SHIMMER_INTERVAL_MS = 80;

/** Characters covered by the highlight window. */
export const HIGHLIGHT_WIDTH = 3;

export const DEFAULT_COMPACTION_LABEL = "Compacting context...";

const WORKING_LABEL_LENGTH = Array.from(WORKING_LABEL).length;

export interface StatusIndicatorLike {
  kind?: string;
  message?: string;
  setMessage?(message: string): void;
}

export interface ParsedCompactionLabel {
  baseLabel: string;
  cancelHint: string | undefined;
}

export function getHighlightWidth(labelLength: number): number {
  return Math.max(1, Math.min(HIGHLIGHT_WIDTH, labelLength));
}

export function getSweepWindow(
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

const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * Elapsed working time as a suffix, one unit pair at a time: `12s`, `1m05s`,
 * `1h00m`, `2d03h`, `3w01d`. Each step carries its remainder down, so a day
 * never shows as `24h00m` and 60 minutes is exactly `1h00m`. Returns
 * `undefined` below one second so the first frames read exactly like the
 * stock label.
 */
export function formatElapsedDuration(elapsedMs: number): string | undefined {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 1000) return undefined;

  let value = Math.floor(elapsedMs / 1000);
  if (value < 60) return `${value}s`;

  const seconds = value % 60;
  value = Math.floor(value / 60);
  if (value < 60) return `${value}m${pad2(seconds)}s`;

  const minutes = value % 60;
  value = Math.floor(value / 60);
  if (value < 24) return `${value}h${pad2(minutes)}m`;

  const hours = value % 24;
  value = Math.floor(value / 24);
  if (value < 7) return `${value}d${pad2(hours)}h`;

  return `${Math.floor(value / 7)}w${pad2(value % 7)}d`;
}

/**
 * Renders the stock label with a highlight window sweeping across it. Only the
 * window is styled: the rest of the label stays unstyled so the color function
 * stock wraps the whole message with keeps applying to it.
 */
export function renderShimmerLabel(
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
 * Stock label plus shimmer window plus elapsed-time suffix. The suffix is
 * parenthesized, mirroring stock's `Working (esc to interrupt)`, and stays
 * unstyled so the color function stock wraps the whole message with keeps
 * applying to it.
 */
export function renderWorkingMessage(
  theme: ThemeLike,
  label: string,
  step: number,
  elapsedMs: number,
): string {
  const shimmer = renderShimmerLabel(theme, label, step);
  const elapsed = formatElapsedDuration(elapsedMs);

  return elapsed === undefined ? shimmer : `${shimmer} (${elapsed})`;
}

/**
 * Parses a compaction status message into base label and optional cancel hint suffix.
 * e.g. "Compacting context... (escape to cancel)" -> { baseLabel: "Compacting context...", cancelHint: "(escape to cancel)" }
 */
export function parseCompactionMessage(message: string | undefined): ParsedCompactionLabel {
  if (!message) {
    return { baseLabel: DEFAULT_COMPACTION_LABEL, cancelHint: "(escape to cancel)" };
  }
  const match = message.match(/^(.*?)(?:\s+(\([^)]+\)))?$/);
  const baseLabel = match?.[1] ? match[1].trim() : DEFAULT_COMPACTION_LABEL;
  const cancelHint = match?.[2] ? match[2].trim() : undefined;
  return { baseLabel, cancelHint };
}

/**
 * Compaction label plus shimmer window plus elapsed-time suffix plus cancel hint.
 */
export function renderCompactionMessage(
  theme: ThemeLike,
  baseLabel: string,
  cancelHint: string | undefined,
  step: number,
  elapsedMs: number,
): string {
  const shimmer = renderShimmerLabel(theme, baseLabel, step);
  const elapsed = formatElapsedDuration(elapsedMs);

  let message = shimmer;
  if (elapsed !== undefined) {
    message += ` (${elapsed})`;
  }
  if (cancelHint !== undefined) {
    message += ` ${cancelHint}`;
  }
  return message;
}

function isStatusIndicatorLike(node: unknown): node is StatusIndicatorLike {
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  return record.kind === "compaction" && typeof record.setMessage === "function";
}

/**
 * Searches the TUI component tree for an active compaction StatusIndicator.
 * Handles both embedded editor mode and separate status container mode.
 */
export function findCompactionIndicator(node: unknown): StatusIndicatorLike | undefined {
  if (!node || typeof node !== "object") return undefined;

  if (isStatusIndicatorLike(node)) {
    return node;
  }

  const record = node as Record<string, unknown>;
  const indicator = record.workingStatusIndicator;
  if (isStatusIndicatorLike(indicator)) {
    return indicator;
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      const found = findCompactionIndicator(child);
      if (found) return found;
    }
  }

  return undefined;
}

/**
 * `setWorkingMessage()` is a no-op outside the TUI, so the timer is only worth
 * running there. An unknown mode is treated as interactive.
 */
function isInteractiveUi(ctx: ExtensionContext): boolean {
  return ctx.mode === undefined || ctx.mode === "tui";
}

export function installWorkingIndicatorShimmer(pi: ExtensionAPI): void {
  // --- Working indicator state ---
  let workingTimer: ReturnType<typeof setInterval> | undefined;
  let workingStep = 0;
  let workingStartedAt = 0;

  // --- Compaction indicator state ---
  let compactionTimer: ReturnType<typeof setInterval> | undefined;
  let compactionStep = 0;
  let compactionStartedAt = 0;
  let activeCompactionIndicator: StatusIndicatorLike | undefined;
  let initialCompactionMessage: string | undefined;

  // Cached TUI reference acquired through momentary widget probe
  let tuiReference: TuiLike | undefined;

  const probeTui = (ctx: ExtensionContext): TuiLike | undefined => {
    if (!tuiReference && ctx.ui && typeof ctx.ui.setWidget === "function") {
      ctx.ui.setWidget("__pi_working_enhanced_probe__", (tui: TuiLike) => {
        tuiReference = tui;
        return {
          render: () => [],
          invalidate: () => {},
        };
      });
      ctx.ui.setWidget("__pi_working_enhanced_probe__", undefined);
    }
    return tuiReference;
  };

  const stopWorking = (ctx: ExtensionContext): void => {
    const wasRunning = workingTimer !== undefined;
    if (workingTimer !== undefined) {
      clearInterval(workingTimer);
      workingTimer = undefined;
    }
    workingStartedAt = 0;

    // Restore the stock label (`defaultWorkingMessage`), but only when this
    // extension was the one that replaced it.
    if (wasRunning && isInteractiveUi(ctx)) {
      ctx.ui.setWorkingMessage();
    }
  };

  const startWorking = (ctx: ExtensionContext): void => {
    if (!isInteractiveUi(ctx)) return;
    if (workingTimer !== undefined) clearInterval(workingTimer);

    const { ui } = ctx;
    const cycleLength = WORKING_LABEL_LENGTH + getHighlightWidth(WORKING_LABEL_LENGTH);
    const tick = (): void => {
      ui.setWorkingMessage(
        renderWorkingMessage(
          ui.theme,
          WORKING_LABEL,
          workingStep,
          Date.now() - workingStartedAt,
        ),
      );
      workingStep = (workingStep + 1) % cycleLength;
    };

    workingStep = 0;
    workingStartedAt = Date.now();
    tick();
    workingTimer = setInterval(tick, SHIMMER_INTERVAL_MS);
  };

  const stopCompaction = (): void => {
    if (compactionTimer !== undefined) {
      clearInterval(compactionTimer);
      compactionTimer = undefined;
    }
    if (
      activeCompactionIndicator &&
      initialCompactionMessage !== undefined &&
      activeCompactionIndicator.kind === "compaction" &&
      typeof activeCompactionIndicator.setMessage === "function"
    ) {
      try {
        activeCompactionIndicator.setMessage(initialCompactionMessage);
      } catch (error) {
        // StatusIndicator may have already been unmounted or disposed by the host.
        void error;
      }
    }
    activeCompactionIndicator = undefined;
    initialCompactionMessage = undefined;
    compactionStartedAt = 0;
  };

  const startCompaction = (ctx: ExtensionContext): void => {
    if (!isInteractiveUi(ctx)) return;
    if (compactionTimer !== undefined) {
      clearInterval(compactionTimer);
      compactionTimer = undefined;
    }

    const tui = probeTui(ctx);
    activeCompactionIndicator = findCompactionIndicator(tui);
    initialCompactionMessage = activeCompactionIndicator?.message;

    const { baseLabel, cancelHint } = parseCompactionMessage(initialCompactionMessage);
    const labelCharactersLength = Array.from(baseLabel).length;
    const cycleLength = labelCharactersLength + getHighlightWidth(labelCharactersLength);

    const tick = (): void => {
      if (!activeCompactionIndicator) {
        activeCompactionIndicator = findCompactionIndicator(probeTui(ctx));
        if (activeCompactionIndicator && initialCompactionMessage === undefined) {
          initialCompactionMessage = activeCompactionIndicator.message;
        }
      }

      const elapsedMs = Date.now() - compactionStartedAt;
      const message = renderCompactionMessage(
        ctx.ui.theme,
        baseLabel,
        cancelHint,
        compactionStep,
        elapsedMs,
      );

      if (
        activeCompactionIndicator &&
        typeof activeCompactionIndicator.setMessage === "function" &&
        activeCompactionIndicator.kind === "compaction"
      ) {
        activeCompactionIndicator.setMessage(message);
      } else {
        ctx.ui.setWorkingMessage(message);
      }

      compactionStep = (compactionStep + 1) % cycleLength;
    };

    compactionStep = 0;
    compactionStartedAt = Date.now();
    tick();
    compactionTimer = setInterval(tick, SHIMMER_INTERVAL_MS);
  };

  pi.on("agent_start", (_event, ctx) => {
    stopCompaction();
    startWorking(ctx);
  });

  pi.on("agent_end", (_event, ctx) => {
    stopWorking(ctx);
  });

  pi.on("session_before_compact", (_event, ctx) => {
    stopWorking(ctx);
    startCompaction(ctx);
  });

  pi.on("session_compact", () => {
    stopCompaction();
  });

  pi.on("session_compact_failed", () => {
    stopCompaction();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopWorking(ctx);
    stopCompaction();
  });
}
