// Vitest's populateGlobal only overrides globalThis keys from a fixed
// allowlist, so Node's flag-gated `localStorage`/`sessionStorage` globals
// (they evaluate to `undefined` without --localstorage-file) shadow the
// jsdom implementations. Re-bind them from the jsdom window here.
const jsdom = (
  globalThis as unknown as {
    jsdom?: { window: Record<string, unknown> };
  }
).jsdom;

if (jsdom?.window) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdom.window[key],
      configurable: true,
    });
  }
}
