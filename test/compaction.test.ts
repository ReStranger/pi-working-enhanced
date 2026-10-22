import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCompactionMessage,
  renderCompactionMessage,
  findCompactionIndicator,
  installWorkingIndicatorShimmer,
} from "../src/working-indicator.ts";
import type { ExtensionAPI, ExtensionContext, ThemeLike } from "../src/index.ts";

const mockTheme: ThemeLike = {
  bold: (text: string) => `**${text}**`,
};

test("parseCompactionMessage parses various stock compaction labels", () => {
  const manual = parseCompactionMessage("Compacting context... (escape to cancel)");
  assert.equal(manual.baseLabel, "Compacting context...");
  assert.equal(manual.cancelHint, "(escape to cancel)");

  const auto = parseCompactionMessage("Auto-compacting... (escape to cancel)");
  assert.equal(auto.baseLabel, "Auto-compacting...");
  assert.equal(auto.cancelHint, "(escape to cancel)");

  const overflow = parseCompactionMessage("Context overflow detected, Auto-compacting... (escape to cancel)");
  assert.equal(overflow.baseLabel, "Context overflow detected, Auto-compacting...");
  assert.equal(overflow.cancelHint, "(escape to cancel)");

  const noHint = parseCompactionMessage("Compacting context...");
  assert.equal(noHint.baseLabel, "Compacting context...");
  assert.equal(noHint.cancelHint, undefined);

  const fallback = parseCompactionMessage(undefined);
  assert.equal(fallback.baseLabel, "Compacting context...");
  assert.equal(fallback.cancelHint, "(escape to cancel)");
});

test("renderCompactionMessage produces shimmer and elapsed time", () => {
  const renderedZero = renderCompactionMessage(
    mockTheme,
    "Compacting context...",
    "(escape to cancel)",
    0,
    500,
  );
  // Initial frame at step 0 is unstyled so it matches stock label
  assert.equal(renderedZero, "Compacting context... (escape to cancel)");

  const renderedShimmer = renderCompactionMessage(
    mockTheme,
    "Compacting context...",
    "(escape to cancel)",
    3,
    500,
  );
  assert.ok(renderedShimmer.includes("**Com**"));
  assert.ok(renderedShimmer.endsWith("(escape to cancel)"));
  assert.ok(!renderedShimmer.includes("s)"));

  const renderedElapsed = renderCompactionMessage(
    mockTheme,
    "Compacting context...",
    "(escape to cancel)",
    5,
    15000,
  );
  assert.ok(renderedElapsed.includes("(15s)"));
  assert.ok(renderedElapsed.endsWith("(escape to cancel)"));
});

test("findCompactionIndicator locates indicator in different component tree layouts", () => {
  const mockIndicator = {
    kind: "compaction",
    message: "Compacting context... (escape to cancel)",
    setMessage: () => {},
  };

  // Direct root
  assert.equal(findCompactionIndicator(mockIndicator), mockIndicator);

  // Embedded in CustomEditor
  const editorRoot = {
    children: [
      {
        workingStatusIndicator: mockIndicator,
      },
    ],
  };
  assert.equal(findCompactionIndicator(editorRoot), mockIndicator);

  // Deeply nested in statusContainer
  const containerRoot = {
    children: [
      { children: [] },
      { children: [mockIndicator] },
    ],
  };
  assert.equal(findCompactionIndicator(containerRoot), mockIndicator);

  // Not compaction kind
  const workingIndicator = {
    kind: "working",
    message: "Working",
    setMessage: () => {},
  };
  assert.equal(findCompactionIndicator({ children: [workingIndicator] }), undefined);
});

test("installWorkingIndicatorShimmer attaches lifecycle handlers and updates compaction message", () => {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  const mockPi: ExtensionAPI = {
    on: (event: string, handler: any) => {
      handlers.set(event, handler);
    },
  };

  installWorkingIndicatorShimmer(mockPi);

  assert.ok(handlers.has("agent_start"));
  assert.ok(handlers.has("agent_end"));
  assert.ok(handlers.has("session_before_compact"));
  assert.ok(handlers.has("session_compact"));
  assert.ok(handlers.has("session_compact_failed"));
  assert.ok(handlers.has("session_shutdown"));

  let indicatorMessage = "Compacting context... (escape to cancel)";
  const indicator = {
    kind: "compaction",
    get message() {
      return indicatorMessage;
    },
    setMessage(msg: string) {
      indicatorMessage = msg;
    },
  };

  const mockCtx: ExtensionContext = {
    mode: "tui",
    ui: {
      theme: mockTheme,
      setWorkingMessage: () => {},
      setWidget: (_key, factory) => {
        if (typeof factory === "function") {
          factory({
            children: [
              {
                workingStatusIndicator: indicator,
              },
            ],
          }, mockTheme);
        }
      },
    },
  };

  const beforeCompact = handlers.get("session_before_compact");
  assert.ok(beforeCompact);
  beforeCompact?.({}, mockCtx);

  try {
    // Initial tick is step 0 (matches stock label)
    assert.equal(indicatorMessage, "Compacting context... (escape to cancel)");
  } finally {
    // Compact finishes and clears timer
    const onCompact = handlers.get("session_compact");
    assert.ok(onCompact);
    onCompact?.({}, mockCtx);
  }

  // Original message restored
  assert.equal(indicatorMessage, "Compacting context... (escape to cancel)");
});

test("installWorkingIndicatorShimmer timer ticks and animates shimmer", async () => {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  const mockPi: ExtensionAPI = {
    on: (event: string, handler: any) => {
      handlers.set(event, handler);
    },
  };

  installWorkingIndicatorShimmer(mockPi);

  let indicatorMessage = "Compacting context... (escape to cancel)";
  const indicator = {
    kind: "compaction",
    get message() {
      return indicatorMessage;
    },
    setMessage(msg: string) {
      indicatorMessage = msg;
    },
  };

  const mockCtx: ExtensionContext = {
    mode: "tui",
    ui: {
      theme: mockTheme,
      setWorkingMessage: () => {},
      setWidget: (_key, factory) => {
        if (typeof factory === "function") {
          factory({
            children: [
              {
                workingStatusIndicator: indicator,
              },
            ],
          }, mockTheme);
        }
      },
    },
  };

  const beforeCompact2 = handlers.get("session_before_compact");
  assert.ok(beforeCompact2);
  beforeCompact2?.({}, mockCtx);

  try {
    // Wait for 2-3 ticks (~200ms)
    await new Promise((resolve) => setTimeout(resolve, 200));
    // The message should now have progressed past step 0 and contain bold shimmer tags
    assert.ok(indicatorMessage.includes("**"));
    assert.ok(indicatorMessage.includes("(escape to cancel)"));
  } finally {
    const onCompact = handlers.get("session_compact");
    assert.ok(onCompact);
    onCompact?.({}, mockCtx);
  }

  assert.equal(indicatorMessage, "Compacting context... (escape to cancel)");
});

test("installWorkingIndicatorShimmer preserves working indicator behavior", () => {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  const mockPi: ExtensionAPI = {
    on: (event: string, handler: any) => {
      handlers.set(event, handler);
    },
  };

  installWorkingIndicatorShimmer(mockPi);

  let currentWorkingMsg: string | undefined = "original";
  let workingMsgCallCount = 0;

  const mockCtx: ExtensionContext = {
    mode: "tui",
    ui: {
      theme: mockTheme,
      setWorkingMessage: (msg?: string) => {
        currentWorkingMsg = msg;
        workingMsgCallCount++;
      },
    },
  };

  const agentStart = handlers.get("agent_start");
  assert.ok(agentStart);
  agentStart?.({}, mockCtx);

  // Initial tick sets working message (step 0 matches stock label "Working")
  assert.equal(currentWorkingMsg, "Working");
  assert.equal(workingMsgCallCount, 1);

  const agentEnd = handlers.get("agent_end");
  assert.ok(agentEnd);
  agentEnd?.({}, mockCtx);

  // Stop restores stock label by calling setWorkingMessage() with undefined
  assert.equal(currentWorkingMsg, undefined);
  assert.equal(workingMsgCallCount, 2);
});
