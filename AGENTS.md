# AGENTS.md

Browser extension (WXT + Vue 3 + TypeScript) that replaces the new tab page
with an agile board. Works offline against a local IndexedDB store or synced
with a YourTask server over REST + WebSocket.

## Commands

- `pnpm dev` / `pnpm dev:firefox` — dev build with hot reload
- `pnpm build` / `pnpm build:firefox` — production build into `.output/`
- `pnpm test` — run all tests (vitest, one-shot)
- `pnpm test:watch` — vitest watch mode
- `pnpm typecheck` — `vue-tsc --noEmit` (run before committing)

## Layout

- `lib/` — framework-free logic: settings, config, IndexedDB (`localDb`),
  markdown sanitizing, PKCE, AI text sanitizer, error mapping, locales
- `composables/` — Vue composables holding all UI state and business logic
- `components/` — Vue SFCs (mostly presentational)
- `composables/entrypoints/` — WXT entrypoints (`newtab`, `options`)
- `tests/` — vitest unit tests, one file per unit under test
- `.wxt/`, `.output/` — generated, never edit

## Testing — what to cover

Business logic lives in `lib/` and `composables/`; that is what tests should
focus on. Components are thin presentation wrappers — cover them only when
they contain non-trivial logic.

**High priority — always cover:**

- `lib/localDb.ts` — IndexedDB CRUD, slug uniqueness, cascade deletes,
  export/import round-trips. Use `fake-indexeddb` (`new IDBFactory()` +
  `vi.resetModules()` per test — the module caches the open connection).
- `lib/settings.ts` — defaults, corrupted JSON, accent validation,
  `uiScale`/`aiPanelWidth` clamping, all persisted keys.
- `lib/config.ts` — API domain normalization (`localhost` → `http`,
  bare domain → `https`), host-permission request flow (stub `chrome`).
- `lib/aiText.ts`, `lib/markdown.ts` — sanitizer edge cases and XSS vectors.
- `lib/locales/` — en/ru key parity (see `tests/locales.test.ts`); add a key
  to one locale → add it to both.
- `composables/useApi.ts` — auth-header, 401/403 token refresh + single
  retry, 5xx/network backoff, error `detail` propagation.
- `composables/useAuth.ts` — token load/expiry, proactive refresh on module
  init, full PKCE login flow (stub `chrome.identity`).
- `composables/useBoardDragDrop.ts` — reorder math (insert index before/
  after), optimistic updates + rollback on API failure, locks, read-only.
- `composables/useBoardData.ts` — WS message handlers (`task.*`), merge by
  id in `silentRefresh`, lock/unlock for other users' drags.
- `composables/useBoardDerived.ts` / `useBoardFilters.ts` — local filtering,
  search matching, sort comparators, `buildTaskParams`, debounce, per-slug
  persistence.
- `composables/useAiChat.ts` — streaming state machine (WS stream events,
  temp-id swapping), presence join/leave incl. delayed leaves, access gating.
- `composables/useOrgData.ts` — local vs remote dispatch, remote-only
  features returning empty locally, remote slug requirements.

**Medium priority:**

- Persistence singletons (`useNotes`, `useSettings`), `useTheme`,
  `useScrollSync`, `useKeyboardShortcuts`, `useActionsMenu`,
  `useRefreshCountdown`, `useBoardTaskOps`, `useBilling`.
- New locales keys and new backend error codes → extend `mapApiError` map
  and its test.

**Skip:** generated code (`.wxt/`), static config, `seedDev` data shapes
beyond a smoke check, trivial getters.

## Test conventions

- Vitest + jsdom (`environmentOptions.jsdom.pretendToBeVisual`), globals on,
  `@/` alias → repo root.
- `tests/setup.ts` re-binds `localStorage`/`sessionStorage` from the jsdom
  window — Node ≥ 22 ships flag-gated globals that shadow them otherwise.
  Do not remove.
- Do **not** switch back to happy-dom: its `NodeIterator` implementation
  makes DOMPurify strip the first element of sanitized output.
- Browser APIs: stub `chrome.*` (`vi.stubGlobal`), `matchMedia`,
  `indexedDB` (`fake-indexeddb`), `fetch` per test.
- Several composables are **module-level singletons** (`useAuth`,
  `useNotes`, `useSettings`, `useAiChat`, `useWebSocket`,
  `useRefreshCountdown`). Isolate state with `vi.resetModules()` + dynamic
  `await import(...)`, or reset the exposed refs in `beforeEach` and call
  `teardown`-style functions to clear timers/subscriptions.
- Mock sibling composables with `vi.mock("@/composables/...")` +
  `vi.hoisted` mock objects; never hit the real network.
- Async retry/debounce/polling paths: `vi.useFakeTimers()` +
  `advanceTimersByTimeAsync` / `runAllTimersAsync`; always restore real
  timers in `finally`/`afterEach`.

## Project rules

- **No white borders in dark theme.** Never use solid white or near-white
  borders (e.g. `hsl(0 0% 100%)` or `hsl(var(--border, 240 5% 90%))`). For
  subtle borders always use `hsl(var(--foreground) / 0.1)` or Tailwind
  `border-foreground/10` — adapts to light/dark automatically.
- **Russian name declension in UI text.** Names (e.g. «Йор») must be
  declined per Russian grammar: «Напишите сообщение Йору», not «Йор».
  Check locale strings whenever a name follows a verb or preposition.
- Filter/sort/search belongs to the backend in remote mode — never
  client-side filtering of remote data.
