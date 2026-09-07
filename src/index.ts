export interface WorkingIndicatorOptions {
  frames?: string[];
  intervalMs?: number;
}

export interface ThemeLike {
  fg(token: string, text: string): string;
  bold(text: string): string;
}

export interface ExtensionUIContext {
  setWorkingIndicator(options?: WorkingIndicatorOptions): void;
  setWorkingMessage(message?: string): void;
  theme: ThemeLike;
}

export interface ExtensionContext {
  ui: ExtensionUIContext;
}

export interface ExtensionAPI {
  on(
    event: "agent_start" | "agent_end" | "session_shutdown",
    handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>,
  ): void;
}

export { installWorkingIndicatorShimmer } from "./working-indicator.ts";
