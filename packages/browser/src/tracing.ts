/**
 * Browser tracing via OpenTelemetry web → Vigilly OTLP ingest.
 *
 * Sets up a WebTracerProvider with auto-instrumentation for document load, fetch
 * and XHR, exporting spans over OTLP/HTTP. Every page load, resource and API call
 * becomes a span. Outgoing requests to `propagateTo` origins carry a W3C
 * `traceparent` header, so backend traces (any W3C-tracecontext tracer — OTel,
 * dd-trace, …) join the same trace and you get full-stack, browser-rooted traces.
 *
 * Spans are emitted through this module's OWN provider (returned by
 * getBrowserTracer), independent of any global tracer another SDK may register.
 */
import {
  WebTracerProvider,
  StackContextManager,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-web";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, type Tracer } from "@opentelemetry/api";

/** Which auto-instrumentations to enable (all default on). */
export interface BrowserInstrumentationToggle {
  documentLoad?: boolean;
  fetch?: boolean;
  xhr?: boolean;
}

/** Options for {@link initBrowserTracing}. */
export interface BrowserTracingOptions {
  /**
   * Full OTLP/HTTP traces URL — e.g.
   * `https://vigilly.dev/api/observe/<slug>/traces/otlp` (Vigilly ingest) or
   * `http://127.0.0.1:4318/v1/traces` (a plain OTLP collector).
   */
  url: string;
  /** Service name (OTLP `service.name`). */
  service: string;
  /** Deployment environment. */
  environment?: string;
  /** Release / version. */
  release?: string;
  /** Extra headers on every OTLP request. */
  headers?: Record<string, string>;
  /**
   * URLs/origins that should receive a W3C `traceparent` header (to connect to
   * backend traces). Defaults to the current page origin only. Pass your API
   * origins (e.g. `[/https:\/\/([a-z0-9-]+\.)?example\.com/]`) to cover
   * cross-subdomain calls — the server must also allow the header via CORS.
   */
  propagateTo?: (string | RegExp)[];
  /** Toggle individual auto-instrumentations. */
  instrument?: BrowserInstrumentationToggle;
}

let started = false;
let browserTracer: Tracer | null = null;

/** Tracer bound to Vigilly's own browser provider (falls back to the global no-op). */
export function getBrowserTracer(): Tracer {
  return browserTracer ?? trace.getTracer("vigilly-browser");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Start OpenTelemetry browser tracing. Idempotent; no-op without a URL / off-DOM. */
export function initBrowserTracing(options: BrowserTracingOptions): void {
  if (started || typeof window === "undefined" || !options.url) return;
  started = true;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options.service,
    ...(options.release ? { [ATTR_SERVICE_VERSION]: options.release } : {}),
    ...(options.environment ? { "deployment.environment.name": options.environment } : {}),
  });

  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: options.url, headers: options.headers })),
    ],
  });
  // Register globally (installs the W3C tracecontext propagator by default) so
  // instrumentations pick up context; keep a direct handle to our own tracer.
  provider.register({ contextManager: new StackContextManager() });
  browserTracer = provider.getTracer(options.service);

  const propagateTraceHeaderCorsUrls =
    options.propagateTo ?? [new RegExp("^" + escapeRegExp(window.location.origin))];
  const inst = options.instrument ?? {};
  const instrumentations = [];
  if (inst.documentLoad !== false) instrumentations.push(new DocumentLoadInstrumentation());
  if (inst.fetch !== false) {
    instrumentations.push(
      new FetchInstrumentation({ propagateTraceHeaderCorsUrls, clearTimingResources: true }),
    );
  }
  if (inst.xhr !== false) {
    instrumentations.push(new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls }));
  }
  registerInstrumentations({ tracerProvider: provider, instrumentations });
}
