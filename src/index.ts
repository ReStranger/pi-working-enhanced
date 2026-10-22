export interface ThemeLike {
  bold(text: string): string;
}

export interface TuiLike {
  children?: unknown[];
}

export interface ExtensionWidgetOptionsLike {
  placement?: string;
}

export interface ExtensionUIContext {
  /** Overrides the working indicator label; called with no argument it restores the stock label. */
  setWorkingMessage(message?: string): void;
  theme: ThemeLike;
  /** Sets an extension widget; accepts a factory receiving the TUI instance. */
  setWidget?(
    key: string,
    content: ((tui: TuiLike, theme: ThemeLike) => unknown) | string[] | undefined,
    options?: ExtensionWidgetOptionsLike,
  ): void;
}

export interface ExtensionContext {
  ui: ExtensionUIContext;
  /** Run mode; "tui" is the only mode with a working indicator UI. Optional for older hosts. */
  mode?: string;
}

export interface ExtensionEventLike {
  [key: string]: unknown;
}

export interface ExtensionAPI {
  on(
    event:
      | "agent_start"
      | "agent_end"
      | "session_shutdown"
      | "session_before_compact"
      | "session_compact"
      | "session_compact_failed",
    handler: (event: ExtensionEventLike, ctx: ExtensionContext) => void | Promise<void>,
  ): void;
}

export { installWorkingIndicatorShimmer } from "./working-indicator.ts";
