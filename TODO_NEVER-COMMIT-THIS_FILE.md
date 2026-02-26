# TODO (NEVER COMMIT THIS FILE)

**Repo:** ~/Projects/openclaw-development
**Branch:** feat/before-tool-result (newly created from feat/before-tool-result-new)

## Greptile Issues to Fix

### 1. Bug: Variable Shadowing (pi-tool-definition-adapter.ts)
- **Location:** Line 166 in catch block
- **Issue:** `const name` shadows outer `name` (tool name)
- **Impact:** `before_tool_result` hook gets error class name (e.g. `"Error"`) instead of actual tool name
- **Fix:** Rename the catch block variable to something like `errorName` or `errorClassName`

### 2. Inconsistent Hook Ordering (pi-tool-definition-adapter.ts)
- **Location:** Success path vs error path
- **Issue:** 
  - Success: `before_tool_result` → `after_tool_call`
  - Error: reversed order
- **Impact:** Plugins modifying results via `before_tool_result` behave differently on success vs error
- **Fix:** Make error path consistent with success path

### 3. hookContext Not Passed to splitSdkTools
- **Location:** `compact.ts:538` and `attempt.ts:540`
- **Issue:** Callsites don't pass `hookContext` parameter to `splitSdkTools`
- **Impact:** `ctx.agentId` and `ctx.sessionKey` will be undefined in hook
- **Fix:** Pass `hookContext` from the agent/execution context

## Notes
- Created from: feat/before-tool-result-new
- 3 commits ahead of origin/feat/before-tool-result-new
