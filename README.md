# Vigilly exceptions clients for JavaScript/TypeScript

Drop-in, **Sentry-compatible** error/exception clients for [Vigilly](https://vigilly.dev).

This repo ships two packages:

| Package            | Runtime   | Wraps            |
| ------------------ | --------- | ---------------- |
| `@vigilly/browser` | Browsers  | `@sentry/browser` |
| `@vigilly/node`    | Node.js   | `@sentry/node`    |

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
  dsn: "https://<publicKey>@vigilly.dev/<projectId>",
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
https://<publicKey>@<host>/<projectId>
```

e.g. `https://<publicKey>@vigilly.dev/<projectId>` (prod). Other environments use
the matching host, e.g. `https://<publicKey>@staging.vigilly.dev/<projectId>`.

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

## What's supported

This is an **exceptions** client. The curated `Vigilly.init` surface exposes:

- `init`, `captureException`, `captureMessage`
- breadcrumbs (`addBreadcrumb`)
- context & scope (`setUser`, `setTag`, `setTags`, `setExtra`, `setExtras`, `setContext`, `withScope`, `getCurrentScope`)
- lifecycle (`flush`, `close`)
- init options: `dsn`, `release`, `environment`, `debug`, `enabled`, `sampleRate`, `maxBreadcrumbs`, `attachStacktrace`, `normalizeDepth`, `ignoreErrors`, `serverName` (Node), `beforeSend`, `beforeBreadcrumb`, `initialScope`

**Not supported yet** (and intentionally not exposed / not enabled): performance
tracing, profiling, session replay, cron monitoring, and custom integrations.
Tracing is force-disabled. For metrics/traces/logs, use a standard OSS exporter
(OTLP / Prometheus remote_write / Datadog), which Vigilly accepts directly.

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
