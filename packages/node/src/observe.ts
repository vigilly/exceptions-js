/**
 * `initObserve` — one call that wires Vigilly Observe for a Node.js service:
 * exceptions (Sentry envelope) plus OpenTelemetry traces, metrics and logs
 * (OTLP), all derived from a single Vigilly DSN.
 *
 * Why this exists (the sharp edges it hides):
 *
 *  - **Custom servers get no auto-instrumentation.** Framework auto-tracing (e.g.
 *    `@vercel/otel` under Next.js) only engages under the framework's own entry;
 *    a custom `server.ts` produces NO spans on its own. `observeRequestMiddleware`
 *    (see `./middleware`) is the deliberate source of request spans + metrics.
 *  - **Sentry owns the global tracer provider.** `@sentry/node` is built on
 *    OpenTelemetry and registers its own global providers. So we bind our OTLP
 *    export to OUR OWN providers and hand them out via `getTracer`/`getMeter`/
 *    `getLogger` — telemetry never depends on winning the global-registry race.
 *  - **`server_name` defaults to the OS hostname.** We set it to `service` and
 *    keep the real hostname as a `host` tag.
 *  - **Client-disconnect errors are noise.** Aborted-request errors are dropped
 *    from exception reporting by default.
 *
 * A single shared `@opentelemetry/api` version must exist in the dependency tree
 * (Sentry pulls `^1.9.1`); if a second copy is nested, the two fight over the
 * global registry. Keep `@opentelemetry/api` deduped to one version.
 */
import os from "node:os";
import { metrics, trace, type Meter, type Tracer } from "@opentelemetry/api";
import { logs, type Logger } from "@opentelemetry/api-logs";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  otlpBaseUrl,
  otlpSignalUrl,
  parseVigillyDsn,
  type OtlpPathStyle,
  type VigillyOptions,
} from "@vigilly/core";
import { init as initExceptions } from "./exceptions";
import { isRequestAbortError } from "./abortErrors";
import { installConsoleBridge } from "./consoleBridge";

/** Options for {@link initObserve}. */
export interface ObserveOptions {
  /**
   * Vigilly DSN: `https://<publicKey>@<host>/api/observe/<projectId>`. Routes exceptions and,
   * unless `otlp.endpoint` overrides it, derives the OTLP endpoint.
   */
  dsn: string;
  /**
   * Logical service name. Sets the OTLP resource `service.name` and the exception
   * `server_name`, so exceptions and telemetry share one identity in Observe.
   */
  service: string;
  /** Deployment environment, e.g. `production`. */
  environment?: string;
  /** Release identifier (version or git SHA). */
  release?: string;

  /** Report exceptions. Default `true`. */
  exceptions?: boolean;
  /**
   * Report client-disconnect / aborted-request errors. Default `false` — they are
   * dropped as ambient network noise.
   */
  captureAbortErrors?: boolean;
  /**
   * Extra exception options forwarded to the underlying client. `beforeSend` is
   * composed after the abort filter; `dsn`/`environment`/`release`/`serverName`
   * are managed by `initObserve` and ignored here.
   */
  exceptionOptions?: Omit<
    VigillyOptions,
    "dsn" | "environment" | "release" | "serverName"
  >;

  /** OTLP transport for traces/metrics/logs. */
  otlp?: {
    /**
     * Endpoint base. Default: derived from `dsn` (Vigilly ingest). For a plain
     * OTLP collector, set this to its origin (e.g. `http://127.0.0.1:4318`) and
     * `pathStyle: "standard"`.
     */
    endpoint?: string;
    /** Path convention: `"vigilly"` (default) or `"standard"` (`/v1/*`). */
    pathStyle?: OtlpPathStyle;
    /** Bearer token authenticating OTLP export (Vigilly Observe API key). */
    apiKey?: string;
    /** Extra headers merged into every OTLP request. */
    headers?: Record<string, string>;
    /** Metric export interval in ms. Default `60000`. */
    metricIntervalMillis?: number;
  };

  /** Emit traces. Default `true`. */
  traces?: boolean;
  /** Emit metrics. Default `true`. */
  metrics?: boolean;
  /**
   * Emit logs. Default `true` (with a `console.*` → logs bridge). Pass
   * `{ console: false }` to keep the log provider but not wrap console.
   */
  logs?: boolean | { console?: boolean };
}

/** Handle returned by {@link initObserve} for accessing telemetry + shutdown. */
export interface Observe {
  /** Tracer bound to Vigilly's own trace provider (no-op until init). */
  getTracer(): Tracer;
  /** Meter bound to Vigilly's own metric provider (no-op until init). */
  getMeter(): Meter;
  /** Logger bound to Vigilly's own log provider (no-op until init). */
  getLogger(): Logger;
  /** Flush and shut down all telemetry providers. */
  shutdown(): Promise<void>;
}

let started = false;
let observeTracer: Tracer | null = null;
let observeMeter: Meter | null = null;
let observeLogger: Logger | null = null;
const shutdownHooks: Array<() => Promise<void>> = [];

const SERVICE_FALLBACK = "service";

/** Tracer bound to Vigilly's own trace provider (falls back to the global no-op). */
export function getTracer(): Tracer {
  return observeTracer ?? trace.getTracer(SERVICE_FALLBACK);
}

/** Meter bound to Vigilly's own metric provider (falls back to the global no-op). */
export function getMeter(): Meter {
  return observeMeter ?? metrics.getMeter(SERVICE_FALLBACK);
}

/** Logger bound to Vigilly's own log provider (falls back to the global no-op). */
export function getLogger(): Logger {
  return observeLogger ?? logs.getLogger(SERVICE_FALLBACK);
}

/** Flush and shut down every telemetry provider started by {@link initObserve}. */
export async function shutdownObserve(): Promise<void> {
  const hooks = shutdownHooks.splice(0);
  await Promise.allSettled(hooks.map((h) => h()));
  started = false;
  observeTracer = observeMeter = observeLogger = null;
}

/**
 * Wire exceptions + OTLP traces/metrics/logs from a single Vigilly DSN.
 * Idempotent — a second call while already started is a no-op. Individual
 * signals are isolated: a failure in one never destabilises the others or the
 * app. Returns an {@link Observe} handle.
 */
export function initObserve(options: ObserveOptions): Observe {
  const handle: Observe = { getTracer, getMeter, getLogger, shutdown: shutdownObserve };
  if (started) return handle;

  const { service, environment, release } = options;
  // Parse eagerly: a malformed DSN is a configuration error worth failing on.
  // Do this BEFORE marking started, so a bad DSN throws without wedging a retry.
  const dsn = parseVigillyDsn(options.dsn);
  started = true;

  // ── Exceptions ──────────────────────────────────────────────────────────
  if (options.exceptions !== false) {
    try {
      const extra = options.exceptionOptions ?? {};
      const userBeforeSend = extra.beforeSend;
      initExceptions({
        ...extra,
        dsn: options.dsn,
        environment,
        release,
        serverName: service,
        initialScope: extra.initialScope ?? { tags: { host: os.hostname(), service } },
        beforeSend: (event, hint) => {
          if (options.captureAbortErrors !== true && isRequestAbortError(hint?.originalException)) {
            return null;
          }
          return userBeforeSend ? userBeforeSend(event, hint) : event;
        },
      });
    } catch (err) {
      console.error("[vigilly] exception client failed to start:", err);
    }
  }

  // OTLP is optional as a whole — skip cleanly if every signal is disabled.
  const wantTraces = options.traces !== false;
  const wantMetrics = options.metrics !== false;
  const wantLogs = options.logs !== false;
  if (!wantTraces && !wantMetrics && !wantLogs) return handle;

  const base = options.otlp?.endpoint ?? otlpBaseUrl(dsn);
  const pathStyle = options.otlp?.pathStyle ?? "vigilly";
  const headers: Record<string, string> = { ...(options.otlp?.headers ?? {}) };
  if (options.otlp?.apiKey) headers.Authorization = `Bearer ${options.otlp.apiKey}`;
  const url = (signal: "traces" | "metrics" | "logs") => otlpSignalUrl(base, signal, pathStyle);
  const resource = new Resource({ [ATTR_SERVICE_NAME]: service });

  // ── Traces ──────────────────────────────────────────────────────────────
  if (wantTraces) {
    try {
      const provider = new NodeTracerProvider({
        resource,
        spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: url("traces"), headers }))],
      });
      // register() also installs a context manager + propagator when none exists
      // yet, so spans nest even without a framework. If Sentry already installed
      // them this is a benign no-op.
      provider.register();
      observeTracer = provider.getTracer(service);
      shutdownHooks.push(() => provider.shutdown());
    } catch (err) {
      console.error("[vigilly] OTLP traces failed to start:", err);
    }
  }

  // ── Metrics ─────────────────────────────────────────────────────────────
  if (wantMetrics) {
    try {
      const provider = new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: url("metrics"), headers }),
            exportIntervalMillis: options.otlp?.metricIntervalMillis ?? 60_000,
          }),
        ],
      });
      metrics.setGlobalMeterProvider(provider);
      observeMeter = provider.getMeter(service);
      shutdownHooks.push(() => provider.shutdown());
    } catch (err) {
      console.error("[vigilly] OTLP metrics failed to start:", err);
    }
  }

  // ── Logs ────────────────────────────────────────────────────────────────
  if (wantLogs) {
    try {
      const provider = new LoggerProvider({ resource });
      provider.addLogRecordProcessor(
        new BatchLogRecordProcessor(new OTLPLogExporter({ url: url("logs"), headers })),
      );
      logs.setGlobalLoggerProvider(provider);
      observeLogger = provider.getLogger(service);
      shutdownHooks.push(() => provider.shutdown());

      const bridgeConsole = typeof options.logs === "object" ? options.logs.console !== false : true;
      if (bridgeConsole) installConsoleBridge(observeLogger);
    } catch (err) {
      console.error("[vigilly] OTLP logs failed to start:", err);
    }
  }

  return handle;
}
