/**
 * The Vigilly exception-reporting client for browsers — a thin, branded wrapper
 * around the MIT-licensed `@sentry/browser` SDK. It presets the transport to
 * Vigilly's ingest (via the SDK's `tunnel` option, pointing at
 * `https://<host>/api/observe/<projectId>/envelope/`).
 *
 *     import { init, captureException } from "@vigilly/browser";
 *     init({ dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>" });
 *     captureException(new Error("boom"));
 *
 * For exceptions + browser tracing in one call, see `initObserve` in `./observe`.
 */
import * as Sentry from "@sentry/browser";
import { resolveVigillyOptions, type VigillyOptions } from "@vigilly/core";

/**
 * Initialise the Vigilly browser exception client. Wraps `Sentry.init`, routing
 * all envelopes to `https://<host>/api/observe/<projectId>/envelope/`.
 */
export function init(options: VigillyOptions): ReturnType<typeof Sentry.init> {
  return Sentry.init(resolveVigillyOptions(options) as Sentry.BrowserOptions);
}

// Re-exported, supported capture & context API (1:1 with the Sentry SDK).
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
export const addBreadcrumb = Sentry.addBreadcrumb;
export const setContext = Sentry.setContext;
export const setTag = Sentry.setTag;
export const setTags = Sentry.setTags;
export const setExtra = Sentry.setExtra;
export const setExtras = Sentry.setExtras;
export const setUser = Sentry.setUser;
export const withScope = Sentry.withScope;
export const getCurrentScope = Sentry.getCurrentScope;
export const flush = Sentry.flush;
export const close = Sentry.close;
