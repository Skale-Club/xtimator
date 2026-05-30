# Deferred Items — quick-260529-jo8

Out-of-scope discoveries found during execution. NOT fixed (pre-existing, unrelated to this plan's changes).

## Pre-existing tsc errors (MCP SDK not resolvable)

- `app/api/mcp/route.ts(24,8)`: Cannot find module `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`
- `lib/mcp/errors.ts(10,37)`: Cannot find module `@modelcontextprotocol/sdk/types.js`
- `lib/mcp/server.ts(15,24)`: Cannot find module `@modelcontextprotocol/sdk/server/index.js`
- `lib/mcp/tools/registry.ts(17,29)`: Cannot find module `@modelcontextprotocol/sdk/server/index.js`
- `lib/mcp/tools/registry.ts(21,8)`: Cannot find module `@modelcontextprotocol/sdk/types.js`
- `lib/mcp/tools/registry.ts(93,58)`: Parameter `request` implicitly has an `any` type (cascades from the missing module type)

These predate this plan and are unrelated to the landing/auth changes. Likely the `@modelcontextprotocol/sdk` dependency is not installed in this working tree.

## Pre-existing eslint errors in auth-dialog.tsx

- `components/landing/auth-dialog.tsx:561` and `:573`: `react-hooks/set-state-in-effect` — synchronous `setState` calls inside the dialog state-reset effects (`useEffect` blocks at lines 556-573). Pre-existing; not in the code modified by this plan (the OAuth `handleClick` change is at ~line 86).
