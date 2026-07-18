/**
 * `observeRequestMiddleware` — a Connect/Express-style middleware that is the
 * deliberate source of request traces and HTTP server metrics.
 *
 * A custom Node server (or a framework running under one) gets no automatic
 * request instrumentation, so nothing produces spans on its own. Mount this once
 * and every request yields:
 *   - a SERVER span (`<METHOD> <route>`) whose active context wraps the rest of
 *     the request, so downstream spans nest under it; and
 *   - `http.server.request.duration` (histogram, ms) + `http.server.requests`
 *     (counter), tagged with method / route / status.
 *
 * Route labels are normalised (ids collapse to `:id`) to keep metric/trace
 * cardinality bounded.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { context, trace, SpanKind, SpanStatusCode, type Meter, type Tracer } from "@opentelemetry/api";
import { getMeter, getTracer } from "./observe";

/** Connect/Express-style middleware signature. */
export type RequestMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

/** Options for {@link observeRequestMiddleware}. */
export interface RequestMiddlewareOptions {
  /** Tracer to use. Default: Vigilly's own (see `getTracer`). */
  tracer?: Tracer;
  /** Meter to use. Default: Vigilly's own (see `getMeter`). */
  meter?: Meter;
  /** Return true to skip a request entirely (no span, no metric). */
  ignore?: (path: string, req: IncomingMessage) => boolean;
  /** Override route normalisation used for span name + labels. */
  normalizeRoute?: (path: string) => string;
}

const DEFAULT_IGNORE = new Set(["/favicon.ico", "/_next/webpack-hmr"]);

/**
 * Collapse cuid / cuid2 / uuid / pure-numeric path segments to `:id` and cap
 * depth, so the route label stays low-cardinality in the telemetry backend.
 */
export function normalizeRoute(pathname: string): string {
  return (
    "/" +
    pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => {
        if (/^c[a-z0-9]{20,}$/i.test(seg)) return ":id"; // cuid / cuid2
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id"; // uuid
        if (/^\d+$/.test(seg)) return ":id"; // numeric
        return seg;
      })
      .slice(0, 5)
      .join("/")
  );
}

function pathOf(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

/** Build the request-tracing + metrics middleware. */
export function observeRequestMiddleware(options: RequestMiddlewareOptions = {}): RequestMiddleware {
  const ignore = options.ignore;
  const norm = options.normalizeRoute ?? normalizeRoute;

  return (req, res, next) => {
    const path = pathOf(req);
    if (DEFAULT_IGNORE.has(path) || ignore?.(path, req)) {
      next();
      return;
    }

    const tracer = options.tracer ?? getTracer();
    const meter = options.meter ?? getMeter();
    const method = req.method?.toUpperCase() ?? "UNKNOWN";
    const route = norm(path);
    const startedAt = Date.now();

    const span = tracer.startSpan(`${method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": method,
        "http.route": route,
        "url.path": path,
      },
    });

    // End + record exactly once (finish = fully sent, close = aborted).
    let done = false;
    const finish = (aborted: boolean) => {
      if (done) return;
      done = true;
      const status = res.statusCode;
      const attrs = {
        "http.request.method": method,
        "http.route": route,
        "http.response.status_code": status,
      };
      try {
        meter
          .createHistogram("http.server.request.duration", { unit: "ms", description: "HTTP server request duration" })
          .record(Date.now() - startedAt, attrs);
        meter
          .createCounter("http.server.requests", { description: "Total HTTP server requests" })
          .add(1, attrs);
      } catch {
        // metrics must never break the request
      }
      span.setAttribute("http.response.status_code", status);
      if (aborted) span.setStatus({ code: SpanStatusCode.ERROR, message: "connection closed before finish" });
      else if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    };
    res.on("finish", () => finish(false));
    res.on("close", () => finish(!res.writableFinished));

    context.with(trace.setSpan(context.active(), span), () => next());
  };
}
