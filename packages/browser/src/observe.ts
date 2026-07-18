/**
 * `initObserve` — one call that wires Vigilly Observe for a browser app:
 * exceptions (Sentry envelope) plus OpenTelemetry tracing (document load, fetch,
 * XHR → OTLP), all derived from a single Vigilly DSN.
 *
 *     import { Vigilly } from "@vigilly/browser";
 *     Vigilly.initObserve({ dsn, service: "my-app", environment, release });
 *
 * Tracing is on by default; its OTLP endpoint is derived from the DSN. Point at a
 * plain OTLP collector (or the local Vigilly observer, which serves the OTLP spec
 * paths) with `tracing: { url: "http://127.0.0.1:4318/v1/traces" }` or
 * `tracing: { pathStyle: "standard" }`. Disable with `tracing: false`.
 */
import {
  parseVigillyDsn,
  otlpBaseUrl,
  otlpSignalUrl,
  type OtlpPathStyle,
  type VigillyOptions,
} from "@vigilly/core";
import { init as initExceptions } from "./exceptions";
import {
  initBrowserTracing,
  getBrowserTracer,
  type BrowserInstrumentationToggle,
} from "./tracing";

/** Tracing config for {@link BrowserObserveOptions.tracing}. */
export interface BrowserObserveTracingOptions {
  /** Explicit OTLP/HTTP traces URL. Overrides the DSN-derived endpoint. */
  url?: string;
  /** Path convention when deriving from the DSN: "vigilly" (default) or "standard". */
  pathStyle?: OtlpPathStyle;
  /** Extra headers on every OTLP request. */
  headers?: Record<string, string>;
  /** Origins to send W3C `traceparent` to (connects to backend traces). */
  propagateTo?: (string | RegExp)[];
  /** Toggle individual auto-instrumentations. */
  instrument?: BrowserInstrumentationToggle;
}

/** Options for {@link initObserve}. */
export interface BrowserObserveOptions {
  /** Vigilly DSN: `https://<publicKey>@<host>/api/observe/<projectId>`. */
  dsn: string;
  /** Service name — OTLP `service.name` and exception context. */
  service: string;
  /** Deployment environment. */
  environment?: string;
  /** Release / version. */
  release?: string;
  /** Report exceptions. Default `true`. */
  exceptions?: boolean;
  /** Extra exception options forwarded to the underlying client. */
  exceptionOptions?: Omit<VigillyOptions, "dsn" | "environment" | "release">;
  /** Browser tracing. Default on (endpoint derived from the DSN). `false` disables. */
  tracing?: boolean | BrowserObserveTracingOptions;
}

/** Tracer bound to Vigilly's own browser provider (falls back to the global no-op). */
export { getBrowserTracer as getTracer };

/** Wire exceptions + browser tracing from a single Vigilly DSN. */
export function initObserve(options: BrowserObserveOptions): void {
  if (typeof window === "undefined") return;
  const dsn = parseVigillyDsn(options.dsn);

  if (options.exceptions !== false) {
    const extra = options.exceptionOptions ?? {};
    initExceptions({
      ...extra,
      dsn: options.dsn,
      environment: options.environment,
      release: options.release,
      // `service.name` matches the OTLP resource attribute, so browser exceptions
      // route to the SAME Vigilly component as this service's browser traces.
      initialScope: extra.initialScope ?? { tags: { "service.name": options.service } },
    });
  }

  if (options.tracing !== false) {
    const t = typeof options.tracing === "object" ? options.tracing : {};
    const url = t.url ?? otlpSignalUrl(otlpBaseUrl(dsn), "traces", t.pathStyle ?? "vigilly");
    initBrowserTracing({
      url,
      service: options.service,
      environment: options.environment,
      release: options.release,
      headers: t.headers,
      propagateTo: t.propagateTo,
      instrument: t.instrument,
    });
  }
}
