# TODO (NEVER COMMIT THIS FILE)

**Repo:** ~/Projects/openclaw-development
**Branch:** feat/before-tool-result-new (rebased onto develop)

## Greptile Issues to Fix

### 1. Bug: Variable Shadowing (pi-tool-definition-adapter.ts)

- **Location:** Line 166 in catch block + line 210
- **Issue:** `const name` shadows outer `name` (tool name)
- **Impact:** `before_tool_result` hook gets error class name (e.g. `"Error"`) instead of actual tool name
- **Fix:** Change `toolName: name` → `toolName: normalizedName` at line 210

#### Fix Plan

- [x] Apply fix: change `toolName: name` → `toolName: normalizedName` (line 210)
- [x] Update unit tests for error path (verify correct tool name passed)
- [x] Run E2E tests in Docker container

### 2. Inconsistent Hook Ordering (pi-tool-definition-adapter.ts)

- **Location:** Success path vs error path
- **Issue:**
  - Success: `before_tool_result` → `after_tool_call`
  - Error: reversed order
- **Impact:** Plugins modifying results via `before_tool_result` behave differently on success vs error
- **Fix:** Make error path consistent with success path

#### Fix Plan

- [x] Apply fix: reorder hooks in error path (before_tool_result → after_tool_call)
- [x] Run unit tests
- [x] Run integration tests
- [x] Run E2E tests in Docker container
- [x] Commit and push

### 3. hookContext Not Passed to splitSdkTools

- **Location:** `compact.ts:567` and `attempt.ts:660`
- **Issue:** Callsites don't pass `hookContext` parameter to `splitSdkTools`
- **Impact:** `ctx.agentId` and `ctx.sessionKey` will be undefined in hook
- **Fix:** Pass `hookContext` from the agent/execution context

#### Fix Plan

- [x] Apply fix: pass hookContext with { agentId, sessionKey } to splitSdkTools in compact.ts
- [x] Apply fix: pass hookContext with { agentId, sessionKey } to splitSdkTools in attempt.ts
- [x] Run tests
- [x] Commit and push

## Notes

- Rebased onto develop: 2026-02-26
- Previously: feat/before-tool-result-new (3 commits ahead of origin)
