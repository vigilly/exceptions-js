/**
 * `@vigilly/node` — the Vigilly exceptions client for Node.js.
 *
 * A thin, branded wrapper around the MIT-licensed `@sentry/node` SDK. It presets
 * the transport to Vigilly's ingest (via the SDK's `tunnel` option) and exposes
 * only the exception-reporting surface Vigilly supports today.
 *
 *     import { Vigilly } from "@vigilly/node";
 *     Vigilly.init({ dsn: "https://<publicKey>@<project>.vigilly.dev" });
 *     Vigilly.captureException(new Error("boom"));
 */
import * as Sentry from "@sentry/node";
import { resolveVigillyOptions, type VigillyOptions } from "@vigilly/core";

/**
 * Initialise the Vigilly Node client. Wraps `Sentry.init`, routing all envelopes
 * to `https://<project>.vigilly.dev/api/observe/<projectId>/envelope/`.
 */
export function init(options: VigillyOptions): ReturnType<typeof Sentry.init> {
  return Sentry.init(resolveVigillyOptions(options) as Sentry.NodeOptions);
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

/** Convenience namespace mirroring the named exports. */
export const Vigilly = {
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

export default Vigilly;

export type { VigillyOptions, VigillyBreadcrumb } from "@vigilly/core";
