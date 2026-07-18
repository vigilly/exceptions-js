/**
 * `@vigilly/browser` — the Vigilly observability client for browsers.
 *
 * Two entry points:
 *
 *   - Exceptions only (a thin `@sentry/browser` wrapper):
 *
 *         import { Vigilly } from "@vigilly/browser";
 *         Vigilly.init({ dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>" });
 *         Vigilly.captureException(new Error("boom"));
 *
 *   - Full observability — exceptions + OpenTelemetry tracing in one call:
 *
 *         import { Vigilly } from "@vigilly/browser";
 *         Vigilly.initObserve({ dsn, service: "my-app", environment, release });
 *         // page loads, fetch/XHR calls become spans; W3C traceparent connects
 *         // them to your backend traces.
 */
import {
  init,
  captureException,
  captureMessage,
  addBreadcrumb,
  setContext,
  setTag,
  setTags,
  setExtra,
  setExtras,
  setUser,
  withScope,
  getCurrentScope,
  flush,
  close,
} from "./exceptions";
import { initObserve, getTracer } from "./observe";

// ── Exception surface (1:1 with the Sentry SDK) ─────────────────────────────
export {
  init,
  captureException,
  captureMessage,
  addBreadcrumb,
  setContext,
  setTag,
  setTags,
  setExtra,
  setExtras,
  setUser,
  withScope,
  getCurrentScope,
  flush,
  close,
};

// ── Observability surface ───────────────────────────────────────────────────
export { initObserve, getTracer } from "./observe";
export type { BrowserObserveOptions, BrowserObserveTracingOptions } from "./observe";
export { initBrowserTracing, getBrowserTracer } from "./tracing";
export type { BrowserTracingOptions, BrowserInstrumentationToggle } from "./tracing";

export type { VigillyOptions, VigillyBreadcrumb } from "@vigilly/core";

/** Convenience namespace mirroring the named exports. */
export const Vigilly = {
  // exceptions
  init,
  captureException,
  captureMessage,
  addBreadcrumb,
  setContext,
  setTag,
  setTags,
  setExtra,
  setExtras,
  setUser,
  withScope,
  getCurrentScope,
  flush,
  close,
  // observability
  initObserve,
  getTracer,
};

export default Vigilly;
