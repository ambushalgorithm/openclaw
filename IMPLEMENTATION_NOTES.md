# Implementation Notes — `before_tool_result` Hook

**Date:** 2026-02-11  
**Analyst:** Emilio  
**Status:** Research complete — Ready for authorization to implement

---

## Work Completed (No Authorization Required)

### ✅ Development Environment Verified

| Task                | Status      | Details                                                      |
| ------------------- | ----------- | ------------------------------------------------------------ |
| `npm install`       | ✅ Pass     | 792 packages installed, 3 high severity vulns (pre-existing) |
| `npm run build`     | ✅ Pass     | Dist files generated successfully                            |
| Directory structure | ✅ Verified | `openclaw-development/` ready for development                |

### ✅ Existing Hook Patterns Studied

Located and analyzed the implementation patterns for existing hooks:

**File: `src/plugins/types.ts`**

Hook types follow a consistent pattern:

```typescript
// 1. Hook name in union
export type PluginHookName =
  | "before_agent_start"
  | "agent_end"
  | "before_compaction"
  | "after_compaction"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call" // ← Reference implementation
  | "after_tool_call"
  | "tool_result_persist"
  | "session_start"
  | "session_end"
  | "gateway_start"
  | "gateway_stop";

// 2. Event type
export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

// 3. Result type
export type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

// 4. Handler map entry
export type PluginHookHandlerMap = {
  before_tool_call: (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ) => Promise<PluginHookBeforeToolCallResult | void> | PluginHookBeforeToolCallResult | void;
  // ... other hooks
};
```

**File: `src/plugins/hooks.ts`**

Runner function pattern:

```typescript
/**
 * Run before_tool_call hook.
 * Allows plugins to modify or block tool calls.
 * Runs sequentially.
 */
async function runBeforeToolCall(
  event: PluginHookBeforeToolCallEvent,
  ctx: PluginHookToolContext,
): Promise<PluginHookBeforeToolCallResult | undefined> {
  return runModifyingHook<"before_tool_call", PluginHookBeforeToolCallResult>(
    "before_tool_call",
    event,
    ctx,
    (acc, next) => ({
      params: next.params ?? acc?.params,
      block: next.block ?? acc?.block,
      blockReason: next.blockReason ?? acc?.blockReason,
    }),
  );
}

// Export in return object
return {
  // ... other hooks
  runBeforeToolCall,
  // ... other hooks
};
```

### ✅ Tool Execution Points Identified

**Primary Location: `src/agents/pi-tool-definition-adapter.ts`**

This is where tools are wrapped for execution via the SDK. Two key functions:

#### Function 1: `toToolDefinitions` (line 86)

This wraps standard agent tools (read, exec, bash, etc.):

```typescript
export function toToolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    return {
      name,
      label,
      description,
      parameters,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        const { toolCallId, params, onUpdate, signal } = splitToolExecuteArgs(args);
        try {
          // ⚠️ CURRENT: Direct execution
          return await tool.execute(toolCallId, params, signal, onUpdate);

          // ✅ PROPOSED: Add hook here
          const result = await tool.execute(toolCallId, params, signal, onUpdate);
          const hookResult = await runBeforeToolResult({
            toolName: name,
            toolCallId,
            params,
            content: result,
            isError: false,
            durationMs,
          });
          if (hookResult?.block) {
            return jsonResult({
              status: "blocked",
              reason: hookResult.blockReason,
            });
          }
          return hookResult?.content ?? result;
        } catch (err) {
          // error handling
        }
      },
    };
  });
}
```

#### Function 2: `toClientToolDefinitions` (line 123)

This wraps client-side tools and **already uses `before_tool_call`** hook:

```typescript
export function toClientToolDefinitions(...): ToolDefinition[] {
  return tools.map((tool) => {
    return {
      name,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        // ✅ ALREADY HAS: before_tool_call hook
        const outcome = await runBeforeToolCallHook({
          toolName: func.name,
          params,
          toolCallId,
        });
        if (outcome.blocked) {
          throw new Error(outcome.reason);
        }

        return jsonResult({
          status: "pending",
          tool: func.name,
        });
      },
    };
  });
}
```

### ✅ Key Finding: Hook Infrastructure Exists

The `runBeforeToolCallHook` function is imported from:

```typescript
import { runBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
```

This pattern can be replicated for `before_tool_result`:

```typescript
import { runBeforeToolResultHook } from "./pi-tools.before-tool-result.js";
```

---

## Implementation Plan

### Phase 1: Type Definitions (`src/plugins/types.ts`)

**Changes required:**

1. Add to `PluginHookName` union:

   ```typescript
   | "before_tool_result"
   ```

2. Add event type:

   ```typescript
   export type PluginHookBeforeToolResultEvent = {
     toolName: string;
     toolCallId: string;
     params: Record<string, unknown>;
     content: unknown;
     isError: boolean;
     durationMs?: number;
   };
   ```

3. Add result type:

   ```typescript
   export type PluginHookBeforeToolResultResult = {
     content?: unknown;
     block?: boolean;
     blockReason?: string;
   };
   ```

4. Add to handler map:
   ```typescript
   before_tool_result: (
     event: PluginHookBeforeToolResultEvent,
     ctx: PluginHookToolContext,
   ) => Promise<PluginHookBeforeToolResultResult | void> | PluginHookBeforeToolResultResult | void;
   ```

### Phase 2: Hook Runner (`src/plugins/hooks.ts`)

**Changes required:**

1. Import new types
2. Implement `runBeforeToolResult` function
3. Export in return object

### Phase 3: Tool Wrapper (`src/agents/pi-tool-definition-adapter.ts`)

**Changes required:**

1. Import hook runner
2. Wrap tool execution in `toToolDefinitions`
3. Call `runBeforeToolResult` after execution, before returning

### Phase 4: New Helper Module (Optional)

Following `pi-tools.before-tool-call.ts` pattern, create:

**File: `src/agents/pi-tools.before-tool-result.ts`**

```typescript
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { normalizeToolName } from "./tool-policy.js";

export async function runBeforeToolResultHook(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  result: unknown;
  isError: boolean;
  durationMs: number;
  ctx?: { agentId?: string; sessionKey?: string };
}) {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_tool_result")) {
    return { blocked: false, result: args.result };
  }

  const toolName = normalizeToolName(args.toolName || "tool");

  const hookResult = await hookRunner.runBeforeToolResult(
    {
      toolName,
      toolCallId: args.toolCallId ?? "",
      params: args.params as Record<string, unknown>,
      content: args.result,
      isError: args.isError,
      durationMs: args.durationMs,
    },
    {
      toolName,
      agentId: args.ctx?.agentId,
      sessionKey: args.ctx?.sessionKey,
    },
  );

  if (hookResult?.block) {
    return {
      blocked: true,
      reason: hookResult.blockReason || "Tool result blocked by plugin hook",
    };
  }

  return {
    blocked: false,
    result: hookResult?.content ?? args.result,
  };
}
```

---

## Files to Modify (Summary)

| File                                        | Change Type | Lines of Code               |
| ------------------------------------------- | ----------- | --------------------------- |
| `src/plugins/types.ts`                      | Add types   | ~30 lines                   |
| `src/plugins/hooks.ts`                      | Add runner  | ~30 lines                   |
| `src/agents/pi-tool-definition-adapter.ts`  | Invoke hook | ~40 lines                   |
| `src/agents/pi-tools.before-tool-result.ts` | New file    | ~50 lines (optional helper) |

---

## Testing Strategy

### Unit Tests

Create: `src/plugins/hooks.before-tool-result.test.ts`

Test cases:

- Hook registration and execution
- Content modification
- Blocking behavior
- Error handling
- Multiple handlers (priority)

### Integration Tests

- Test with `read` tool: file content sanitization
- Test with `exec` tool: command output filtering
- Test with `web_search`: result injection detection

---

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation                                |
| ----------------------- | ---------- | ------ | ----------------------------------------- |
| Breaking existing tools | Low        | High   | Only wrap result, preserve error handling |
| Performance degradation | Low        | Medium | Async hook, parallel to execution         |
| Hook not called         | Low        | High   | Feature detection with `hasHooks()`       |
| Type errors             | Low        | Medium | Incremental TypeScript compilation        |

---

## Comparative Analysis: `before_tool_call` vs `before_tool_result`

| Aspect         | `before_tool_call` (exists) | `before_tool_result` (proposed) |
| -------------- | --------------------------- | ------------------------------- |
| **Fires when** | Before tool executes        | After execution, before LLM     |
| **Can see**    | Tool params                 | Tool result content             |
| **Can modify** | Params                      | Result content                  |
| **Can block**  | ✅ Yes (prevent execution)  | ✅ Yes (filter result)          |
| **Use case**   | Block dangerous commands    | Sanitize output, filter PII     |
| **Pattern**    | Same infrastructure         | Same infrastructure             |

---

## Implementation Authorization Request

**Ready to proceed with Phase 1?**

Phase 1 (Type Definitions) involves:

1. Adding `"before_tool_result"` to `PluginHookName` union
2. Adding `PluginHookBeforeToolResultEvent` type
3. Adding `PluginHookBeforeToolResultResult` type
4. Adding handler map entry

**Risk:** Low — type additions only, no runtime code changes

**Authorization required before proceeding:** Yes

---

_Notes compiled: 2026-02-11_  
_Environment: openclaw-development (feat/before-tool-result branch)_  
_Build status: ✅ Passing_  
_Next: Awaiting authorization for Phase 1 implementation_
