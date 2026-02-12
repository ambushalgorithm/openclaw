import { appendFile, writeFile } from "node:fs/promises";

// Inline type definitions (to avoid external SDK dependency)
type PluginConfig = {
  logFilePath?: string;
  maxEvents?: number;
  modifyContent?: boolean;
  blockTool?: string;
};

type BeforeToolResultEvent = {
  toolName: string;
  toolCallId: string;
  params: Record<string, unknown>;
  content: unknown;
  isError: boolean;
  durationMs: number;
};

type BeforeToolResultResult = {
  content?: unknown;
  block?: boolean;
  blockReason?: string;
};

type PluginContext = {
  toolName: string;
  agentId?: string;
  sessionKey?: string;
};

type ApiRegisterHookFn = <K extends string>(
  hookName: K,
  handler: (event: unknown, ctx: unknown) => unknown | Promise<unknown>,
) => void;

type ApiRegisterGatewayMethodFn = (
  method: string,
  handler: (ctx: {
    params: Record<string, unknown>;
    respond: (success: boolean, data: unknown) => void;
    sendError: (message: string) => void;
  }) => void,
) => void;

type PluginApi = {
  registerHook: ApiRegisterHookFn;
  registerGatewayMethod: ApiRegisterGatewayMethodFn;
};

type CapturedEvent = {
  hookName: "before_tool_result";
  timestamp: string;
  toolName: string;
  toolCallId: string;
  params: Record<string, unknown>;
  contentType: string;
  isError: boolean;
  durationMs: number;
  wasModified: boolean;
  wasBlocked: boolean;
};

const DEFAULT_LOG_PATH = "/home/node/.openclaw/workspace/hook-events.log";

export default {
  id: "test-hooks",
  register(api: PluginApi, config: PluginConfig = {}) {
    const {
      logFilePath = DEFAULT_LOG_PATH,
      maxEvents = 100,
      modifyContent = false,
      blockTool = "",
    } = config;

    const events: CapturedEvent[] = [];
    let totalCaptured = 0;

    // Clear log file on startup
    writeFile(logFilePath, "", "utf-8").catch(() => {
      // Ignore errors (file might not exist yet)
    });

    // Register the before_tool_result hook
    api.registerHook(
      "before_tool_result",
      async (event: unknown, _ctx: unknown): Promise<BeforeToolResultResult | void> => {
        const hookEvent = event as BeforeToolResultEvent;
        totalCaptured++;

        // Determine content type for logging
        let contentType = "unknown";
        if (typeof hookEvent.content === "string") {
          contentType = "string";
        } else if (Array.isArray(hookEvent.content)) {
          contentType = "array";
        } else if (hookEvent.content && typeof hookEvent.content === "object") {
          contentType = "object";
        }

        const capturedEvent: CapturedEvent = {
          hookName: "before_tool_result",
          timestamp: new Date().toISOString(),
          toolName: hookEvent.toolName,
          toolCallId: hookEvent.toolCallId,
          params: hookEvent.params,
          contentType,
          isError: hookEvent.isError,
          durationMs: hookEvent.durationMs,
          wasModified: false,
          wasBlocked: false,
        };

        // Check if we should block this tool
        if (blockTool && hookEvent.toolName === blockTool) {
          capturedEvent.wasBlocked = true;
          await logEvent(capturedEvent);
          return {
            block: true,
            blockReason: `Tool "${hookEvent.toolName}" blocked by test plugin`,
          };
        }

        // Check if we should modify content
        if (modifyContent) {
          capturedEvent.wasModified = true;
          await logEvent(capturedEvent);
          return {
            content: {
              type: "text",
              text: "[MODIFIED BY TEST PLUGIN]",
            },
          };
        }

        // Store in memory (with limit)
        events.push(capturedEvent);
        if (events.length > maxEvents) {
          events.shift();
        }

        await logEvent(capturedEvent);

        // Return undefined to not modify/block
      },
    );

    // Helper to log event to file
    async function logEvent(event: CapturedEvent): Promise<void> {
      const logLine = JSON.stringify(event) + "\n";
      try {
        await appendFile(logFilePath, logLine, "utf-8");
      } catch (err) {
        console.error(`[test-hooks] Failed to write to log: ${err}`);
      }
    }

    // Register gateway method to get captured events
    api.registerGatewayMethod("test-hooks.getEvents", ({ respond }) => {
      respond(true, { events, totalCaptured });
    });

    // Register gateway method to clear events
    api.registerGatewayMethod("test-hooks.clear", ({ respond }) => {
      events.length = 0;
      writeFile(logFilePath, "", "utf-8").catch(() => {});
      respond(true, { cleared: true });
    });

    // Register gateway method to get status
    api.registerGatewayMethod("test-hooks.status", ({ respond }) => {
      respond(true, {
        status: "active",
        eventsInMemory: events.length,
        totalCaptured,
        config: {
          logFilePath,
          maxEvents,
          modifyContent,
          blockTool,
        },
      });
    });

    // Register gateway method to configure plugin
    api.registerGatewayMethod("test-hooks.configure", ({ params, respond }) => {
      // Note: Dynamic config changes would require more complex implementation
      respond(true, { configured: true, receivedParams: params });
    });

    console.log("[test-hooks] Plugin registered successfully");
  },
};
