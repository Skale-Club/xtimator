# Deferred Items — quick-260521-jx9

Pre-existing issues discovered during execution but out of scope for this task (no functional change required by Task 1/Task 2).

## 1. `recording-item.tsx`: stale `useCallback` deps on `handleDelete` (pre-existing)

- **File:** `components/workspace/audio/recording-item.tsx`
- **Lines:** 79-98
- **ESLint rules:** `react-hooks/preserve-manual-memoization` (error), `react-hooks/exhaustive-deps` (warning)
- **Status in HEAD before this task:** Already present — `handleDelete` calls `t('Delete this recording? This cannot be undone.')` but the dependency array `[recording.id, onDelete]` omits `t`.
- **Why deferred:** Plan jx9 only touches imports, the props interface, a new `handleRetry` callback, and JSX header layout. The `handleDelete` body and deps are untouched by this task. Per the GSD scope boundary, pre-existing lint issues outside the current task's diff are not auto-fixed.
- **Recommended next step:** A separate cleanup task can add `t` to the deps array (or refactor `handleDelete` to capture the message via `useTranslation` invocation pattern). Same applies to any other handlers in `audio-tab.tsx` / `recording-item.tsx` that consume `t` without listing it as a dep.
