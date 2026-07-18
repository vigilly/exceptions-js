/**
 * Mapping from the curated `VigillyOptions` surface to the option object the
 * underlying Sentry SDK consumes.
 *
 * The surface is intentionally small: it exposes the exception-reporting
 * features Vigilly supports today and omits everything else (performance
 * tracing, profiling, session replay, cron monitoring, custom integrations,
 * …). Those are neither forwarded nor enabled, so a Vigilly client only ever
 * sends error/message envelopes.
 */
import { envelopeTunnelUrl, parseVigillyDsn, toSentryDsn } from "./dsn";

/** Curated, transport-agnostic shape of a captured breadcrumb. */
export interface VigillyBreadcrumb {
  type?: string;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

/** Minimal event/hint typing — kept loose to stay SDK-version agnostic. */
export type VigillyEvent = Record<string, any>;
export type VigillyEventHint = Record<string, any>;

/**
 * The options accepted by `Vigilly.init`. A curated subset of the Sentry init
 * options plus the Vigilly DSN. Unsupported Sentry options (tracing, replay,
 * integrations, …) are deliberately absent.
 */
export interface VigillyOptions {
  /** Vigilly DSN: `https://<publicKey>@<host>/api/observe/<projectId>`, e.g. `https://<publicKey>@vigilly.dev/api/observe/<projectId>`. */
  dsn: string;
  /** Release identifier (e.g. a version or git SHA). */
  release?: string;
  /** Deployment environment, e.g. `production`, `staging`. */
  environment?: string;
  /** Turn on SDK debug logging. */
  debug?: boolean;
  /** Master switch; when `false` the SDK is inert. Defaults to `true`. */
  enabled?: boolean;
  /** Error sampling rate in [0, 1]. Defaults to `1.0`. */
  sampleRate?: number;
  /** Max breadcrumbs retained per event. */
  maxBreadcrumbs?: number;
  /** Attach a synthetic stack trace to captured messages. */
  attachStacktrace?: boolean;
  /** Depth to which structured context is normalized. */
  normalizeDepth?: number;
  /** Patterns of error messages to drop before sending. */
  ignoreErrors?: Array<string | RegExp>;
  /** Server name reported with events (Node). */
  serverName?: string;
  /** Hook to mutate/drop an event before it is sent. Return `null` to drop. */
  beforeSend?: (event: VigillyEvent, hint: VigillyEventHint) => VigillyEvent | null | PromiseLike<VigillyEvent | null>;
  /** Hook to mutate/drop a breadcrumb before it is recorded. */
  beforeBreadcrumb?: (breadcrumb: VigillyBreadcrumb, hint?: any) => VigillyBreadcrumb | null;
  /** Initial scope (tags, user, extra, …) applied at init. */
  initialScope?: Record<string, any> | ((scope: any) => any);
  /**
   * Advanced / testing escape hatch: a custom Sentry transport factory. Most
   * users never set this — Vigilly presets the transport via `tunnel`.
   */
  transport?: (transportOptions: any) => any;
}

/**
 * The resolved option object handed to `Sentry.init`. Includes the synthesised
 * Sentry DSN and the `tunnel` pointing at Vigilly's `/api/observe/:projectId/`
 * `envelope/` route. Typed loosely so each wrapper can cast to its SDK's exact
 * option type.
 */
export type ResolvedVigillyOptions = Record<string, unknown> & {
  dsn: string;
  tunnel: string;
};

/**
 * Translate `VigillyOptions` into the option object for the underlying Sentry
 * SDK: parse the Vigilly DSN, synthesise a Sentry-valid DSN, and preset
 * `tunnel` to Vigilly's ingest URL. Only curated, defined fields are forwarded.
 */
export function resolveVigillyOptions(options: VigillyOptions): ResolvedVigillyOptions {
  const components = parseVigillyDsn(options.dsn);

  const resolved: ResolvedVigillyOptions = {
    dsn: toSentryDsn(components),
    tunnel: envelopeTunnelUrl(components),
    // Vigilly handles exceptions only — never opt the SDK into tracing.
    tracesSampleRate: 0,
    sampleRate: options.sampleRate ?? 1.0,
  };

  // Forward only the curated options that were actually provided.
  const passthrough: Array<keyof VigillyOptions> = [
    "release",
    "environment",
    "debug",
    "enabled",
    "maxBreadcrumbs",
    "attachStacktrace",
    "normalizeDepth",
    "ignoreErrors",
    "serverName",
    "beforeSend",
    "beforeBreadcrumb",
    "initialScope",
    "transport",
  ];
  const sink = resolved as Record<string, unknown>;
  for (const key of passthrough) {
    const value = options[key];
    if (value !== undefined) {
      sink[key] = value;
    }
  }

  return resolved;
}
