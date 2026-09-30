export interface ThemeLike {
  bold(text: string): string;
}

export interface ExtensionUIContext {
  /** Overrides the working indicator label; called with no argument it restores the stock label. */
  setWorkingMessage(message?: string): void;
  theme: ThemeLike;
}

export interface ExtensionContext {
  ui: ExtensionUIContext;
  /** Run mode; "tui" is the only mode with a working indicator UI. Optional for older hosts. */
  mode?: string;
}

export interface ExtensionAPI {
  on(
    event: "agent_start" | "agent_end" | "session_shutdown",
    handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>,
  ): void;
}

export { installWorkingIndicatorShimmer } from "./working-indicator.ts";
