# Vigilly exceptions clients for JavaScript/TypeScript

Drop-in, **Sentry-compatible** error/exception clients for [Vigilly](https://vigilly.dev).

This repo ships two packages:

| Package            | Runtime   | Wraps                              | Signals                          |
| ------------------ | --------- | ---------------------------------- | -------------------------------- |
| `@vigilly/browser` | Browsers  | `@sentry/browser` + OpenTelemetry  | exceptions · traces              |
| `@vigilly/node`    | Node.js   | `@sentry/node` + OpenTelemetry     | exceptions · traces · metrics · logs |

They are **thin wrappers** around the MIT-licensed [Sentry JavaScript SDKs](https://github.com/getsentry/sentry-javascript): they depend on the matching `@sentry/*` SDK, re-export a branded `Vigilly` API, preset the transport to Vigilly's ingest endpoint, and hide upstream features Vigilly does not support yet. You get upstream stability and fixes for free; only the destination and the surface change.

## Install

```bash
# Browser / frontend apps
npm install @vigilly/browser

# Node.js servers
npm install @vigilly/node
```

The matching `@sentry/*` SDK is pulled in automatically as a dependency.

## Usage

```ts
import { Vigilly } from "@vigilly/browser"; // or "@vigilly/node"

Vigilly.init({
  dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>",
  release: "my-app@1.2.3",
  environment: "production",
});

// Capture an exception
try {
  doRiskyThing();
} catch (err) {
  Vigilly.captureException(err);
}

// Capture a message
Vigilly.captureMessage("Something noteworthy happened", "warning");

// Breadcrumbs & context
Vigilly.addBreadcrumb({ category: "auth", message: "User logged in", level: "info" });
Vigilly.setUser({ id: "user_123" });
Vigilly.setTag("feature", "checkout");
Vigilly.setContext("order", { id: "ord_42", total: 99 });
```

Named exports are also available without the namespace:

```ts
import { init, captureException, captureMessage } from "@vigilly/node";
```

## DSN format

A Vigilly DSN is a standard Sentry-shaped DSN — the **public key** identifies
your service and the **host** is the Vigilly Observe ingest host (used as-is):

```
https://<publicKey>@<host>/api/observe/<projectId>
```

e.g. `https://<publicKey>@vigilly.dev/api/observe/<projectId>` (prod). Other
environments use the matching host, e.g.
`https://<publicKey>@staging.vigilly.dev/api/observe/<projectId>`. The projectId
is the last path segment, so a bare `<host>/<projectId>` DSN is accepted too.

### How the endpoint is handled

A stock Sentry DSN derives the ingest URL `<host>/api/<projectId>/envelope/`.
Vigilly's ingest route adds an `observe/` segment:

```
https://<host>/api/observe/<projectId>/envelope/
```

So the wrapper does **not** hand the Vigilly DSN to Sentry verbatim. It parses
the DSN and sets the Sentry SDK's
[`tunnel`](https://docs.sentry.io/platforms/javascript/troubleshooting/#dealing-with-ad-blockers)
to `${protocol}://${host}/api/observe/${projectId}/envelope/` — the bare DSN host
with `observe/` injected before the project id. With `tunnel` set, the SDK posts
the full envelope (including the `dsn` in its header) to that URL.

It also synthesises a Sentry-valid DSN for `Sentry.init`: the Sentry SDK requires
a numeric project id in the DSN, while a Vigilly project id may be a non-numeric
slug, so the synthesised DSN uses a numeric placeholder (`/0`). That project id is
irrelevant to Vigilly — the transport URL is overridden by the tunnel and ingest
auth uses only the public key (read from the `X-Sentry-Auth` header, the
`?sentry_key=` query parameter, or the envelope header's `dsn` field, exactly as
the upstream SDK already provides). No secret is ever sent.

## Full observability (Node)

`@vigilly/node` also ships `initObserve` — one call that wires **exceptions +
OpenTelemetry traces, metrics and logs** (OTLP), all derived from the same DSN:

```ts
import { initObserve, observeRequestMiddleware, getMeter } from "@vigilly/node";

// Once, at process start (before your server starts handling requests):
initObserve({
  dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>",
  service: "my-app",            // = OTLP service.name AND exception server_name
  environment: "production",
  release: "my-app@1.2.3",
  otlp: { apiKey: process.env.VIGILLY_OBSERVE_API_KEY }, // Bearer for OTLP export
});

// Mount on your HTTP server — the source of request spans + http.server.* metrics:
server.use(observeRequestMiddleware());

// Record your own metrics anywhere:
getMeter().createCounter("orders.placed").add(1, { plan: "pro" });
```

That's the whole integration. `initObserve` handles the sharp edges that make a
from-scratch OpenTelemetry + Sentry setup painful:

- **Custom servers get no auto-instrumentation.** Framework auto-tracing only
  engages under the framework's own entry point, so a custom server produces no
  spans on its own. `observeRequestMiddleware` is the deliberate source of
  request spans and `http.server.*` metrics (with id path-segments collapsed to
  `:id` to bound cardinality).
- **Sentry owns the global OpenTelemetry tracer.** `@sentry/node` is built on
  OpenTelemetry and registers its own global providers, so telemetry read via the
  global registry silently goes to Sentry, not your OTLP backend. `initObserve`
  binds export to its **own** providers and hands them out via `getTracer()` /
  `getMeter()` / `getLogger()` — export never depends on winning that race.
- **`server_name` defaults to the OS hostname.** It's set to `service`, with the
  real hostname preserved as a `host` tag.
- **Client-disconnect noise.** Aborted-request errors (`aborted` / `ECONNRESET` /
  premature-close) are dropped from exception reporting by default.

> **One `@opentelemetry/api` version.** OpenTelemetry's global registry is
> version-checked; two copies in your tree (e.g. an older nested one) break
> registration. `@sentry/node` and this package both use `^1.9.1` — keep your app
> on a single deduped `@opentelemetry/api` (a matching root dependency, or an
> `overrides`/`resolutions` pin).

### Targeting a plain OTLP collector

By default OTLP goes to Vigilly ingest (`<host>/api/observe/<projectId>/{signal}/otlp`).
To send to any OpenTelemetry Collector instead (e.g. a local observer on :4318),
point at its origin and switch to the spec paths (`/v1/{signal}`):

```ts
initObserve({
  dsn, service: "my-app",
  otlp: { endpoint: "http://127.0.0.1:4318", pathStyle: "standard", apiKey: "…" },
});
```

`initObserve` options: `dsn`, `service`, `environment`, `release`, `exceptions`
(default on), `captureAbortErrors` (default off), `exceptionOptions`, `traces` /
`metrics` / `logs` (each default on; `logs: { console: false }` keeps the log
provider but stops bridging `console.*`), and `otlp: { endpoint, pathStyle,
apiKey, headers, metricIntervalMillis }`.

## Full observability (Browser)

`@vigilly/browser` also ships `initObserve` — exceptions **plus** OpenTelemetry
browser tracing (document load, fetch, XHR → OTLP) in one call:

```ts
import { Vigilly } from "@vigilly/browser";

Vigilly.initObserve({
  dsn: "https://<publicKey>@vigilly.dev/api/observe/<projectId>",
  service: "my-app",
  environment: "production",
  release: "my-app@1.2.3",
});
```

Every page load, resource and `fetch`/`XHR` call becomes a span, exported over
OTLP. Same-origin requests carry a W3C `traceparent` header, so your **backend**
traces (OTel, dd-trace — any W3C-tracecontext tracer) join the same trace: you get
full-stack, browser-rooted traces. Exceptions work exactly as before.

- Tracing is on by default; its OTLP endpoint is derived from the DSN. Target a
  plain collector (or the local observer, which serves the spec paths) with
  `tracing: { url: "http://127.0.0.1:4318/v1/traces" }` or
  `tracing: { pathStyle: "standard" }`. Disable with `tracing: false`.
- Propagate `traceparent` to cross-subdomain APIs with
  `tracing: { propagateTo: [/https:\/\/([a-z0-9-]+\.)?example\.com/] }` (the server
  must also allow the header via CORS). Same-origin propagation is automatic.

Browser `initObserve` options: `dsn`, `service`, `environment`, `release`,
`exceptions` (default on), `exceptionOptions`, and `tracing` (default on) —
`{ url, pathStyle, headers, propagateTo, instrument }`.

### Hosted script (no build step)

For sites that can't bundle an npm package, the browser SDK is also served as a
hosted IIFE — drop in one tag (gtag / Sentry-loader style):

```html
<script async src="https://cdn.<host>/scripts/observe.js"
  data-dsn="https://<publicKey>@vigilly.dev/api/observe/<projectId>"
  data-service="my-app" data-env="production"></script>
```

It self-initialises from its `data-*` attributes (`data-dsn`, `data-service`,
`data-env`, `data-release`, `data-otlp-url`, `data-otlp-path-style`,
`data-tracing="off"`) by calling the same `initObserve` — same code as the npm
package, just a different delivery. Use whichever fits the stack. Pin a version
with `/scripts/observe.v<n>.js` (immutably cached) or track latest with `/scripts/observe.js`.

## What's supported

`@vigilly/browser` is an **exceptions** client. `@vigilly/node` is exceptions
**plus** OTLP observability (above). The curated `init` surface exposes:

- `init`, `captureException`, `captureMessage`
- breadcrumbs (`addBreadcrumb`)
- context & scope (`setUser`, `setTag`, `setTags`, `setExtra`, `setExtras`, `setContext`, `withScope`, `getCurrentScope`)
- lifecycle (`flush`, `close`)
- init options: `dsn`, `release`, `environment`, `debug`, `enabled`, `sampleRate`, `maxBreadcrumbs`, `attachStacktrace`, `normalizeDepth`, `ignoreErrors`, `serverName` (Node), `beforeSend`, `beforeBreadcrumb`, `initialScope`

Traces, metrics and logs on Node are handled by `initObserve` over OTLP (see
[Full observability](#full-observability-node)) — the Sentry SDK's own
performance tracing stays force-disabled, so exceptions and OpenTelemetry never
double-report. **Not supported** (intentionally not exposed / not enabled):
Sentry profiling, session replay, cron monitoring, and custom Sentry
integrations. In the browser, use a standard OTLP exporter for traces/metrics.

## Development

```bash
npm install        # install workspace deps
npm run build      # tsc project-references build of all three packages
npm test           # vitest unit + routing tests
```

Packages: `@vigilly/core` (shared DSN parsing + Sentry option mapping, internal),
`@vigilly/browser`, `@vigilly/node`.

## License & attribution

MIT — see [LICENSE](./LICENSE). These packages wrap the MIT-licensed Sentry
JavaScript SDKs; see [NOTICE](./NOTICE) for attribution. Vigilly is not
affiliated with or endorsed by Sentry.
