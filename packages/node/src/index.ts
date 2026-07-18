/**
 * `@vigilly/node` — the Vigilly observability client for Node.js.
 *
 * Two entry points:
 *
 *   - Exceptions only (a thin `@sentry/node` wrapper):
 *
 *         import { Vigilly } from "@vigilly/node";
 *         Vigilly.init({ dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>" });
 *         Vigilly.captureException(new Error("boom"));
 *
 *   - Full observability — exceptions + OTLP traces/metrics/logs in one call:
 *
 *         import { initObserve, observeRequestMiddleware } from "@vigilly/node";
 *         initObserve({ dsn, service: "my-app", environment, release });
 *         server.use(observeRequestMiddleware()); // request spans + http.server.* metrics
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
import { initObserve, getTracer, getMeter, getLogger, shutdownObserve } from "./observe";

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
export { initObserve, getTracer, getMeter, getLogger, shutdownObserve } from "./observe";
export type { ObserveOptions, Observe } from "./observe";
export { observeRequestMiddleware, normalizeRoute } from "./middleware";
export type { RequestMiddleware, RequestMiddlewareOptions } from "./middleware";
export { isRequestAbortError } from "./abortErrors";

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
  getMeter,
  getLogger,
  shutdownObserve,
};

export default Vigilly;
