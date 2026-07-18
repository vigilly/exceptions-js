/**
 * Vigilly DSN parsing.
 *
 * A Vigilly DSN is a Sentry-shaped DSN whose path is the Observe ingest path:
 *
 *     https://<publicKey>@<host>/api/observe/<projectId>
 *
 * e.g. `https://<publicKey>@vigilly.dev/api/observe/<projectId>`. The host is the
 * Vigilly Observe ingest host (`vigilly.dev` in prod, `staging.vigilly.dev` /
 * `local.vigilly.dev` for other envs) and is used AS-IS. The public key
 * identifies the service to Vigilly ingest; the projectId is the LAST path
 * segment.
 *
 * Vigilly's ingest route is `<host>/api/observe/<projectId>/envelope/`, which is
 * NOT the path a stock Sentry DSN derives (`<host>/api/<projectId>/envelope/`).
 * The wrapper bridges that gap with the SDK's `tunnel` option — see `options.ts`.
 * The projectId is taken as the last path segment, so a bare `<host>/<projectId>`
 * DSN is accepted too (the ingest path is reconstructed either way).
 */

export interface VigillyDsnComponents {
  /** DSN public key — identifies the service to Vigilly ingest (auth). */
  publicKey: string;
  /** URL protocol, e.g. `https`. */
  protocol: string;
  /** Ingest host, used as-is, e.g. `vigilly.dev`. */
  host: string;
  /** Project identifier from the DSN path; used in the ingest path. */
  projectId: string;
}

export class InvalidVigillyDsnError extends Error {
  constructor(dsn: string, reason: string) {
    super(`Invalid Vigilly DSN "${dsn}": ${reason}`);
    this.name = "InvalidVigillyDsnError";
  }
}

/**
 * Parse a Vigilly DSN into its components.
 *
 * @throws {InvalidVigillyDsnError} when the DSN is missing, malformed, or lacks a
 *   public key / host.
 */
export function parseVigillyDsn(dsn: string): VigillyDsnComponents {
  if (!dsn || typeof dsn !== "string") {
    throw new InvalidVigillyDsnError(String(dsn), "a non-empty DSN string is required");
  }

  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new InvalidVigillyDsnError(dsn, "not a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidVigillyDsnError(dsn, "protocol must be http or https");
  }

  const publicKey = url.username;
  if (!publicKey) {
    throw new InvalidVigillyDsnError(dsn, "missing public key (expected https://<publicKey>@<host>)");
  }
  if (url.password) {
    throw new InvalidVigillyDsnError(dsn, "DSN must not contain a secret — only the public key");
  }

  const host = url.host; // used as-is; includes port if present
  if (!host) {
    throw new InvalidVigillyDsnError(dsn, "missing host");
  }

  const protocol = url.protocol.replace(":", "");

  // Project id is the DSN path segment.
  const projectId = url.pathname.split("/").filter(Boolean).pop() || "";
  if (!projectId) {
    throw new InvalidVigillyDsnError(
      dsn,
      "missing project id (expected https://<publicKey>@<host>/api/observe/<projectId>)",
    );
  }

  return { publicKey, protocol, host, projectId };
}

/**
 * The Vigilly envelope ingest URL for a parsed DSN. Used as the Sentry SDK's
 * `tunnel` so envelopes land on Vigilly's route shape rather than the path a
 * stock Sentry DSN would derive.
 */
export function envelopeTunnelUrl(c: VigillyDsnComponents): string {
  return `${c.protocol}://${c.host}/api/observe/${c.projectId}/envelope/`;
}

/**
 * Placeholder project id used in the synthesised Sentry DSN. The Sentry SDK
 * validates that a DSN's project id is purely numeric, while a Vigilly project
 * id may be a non-numeric slug. The synthesised DSN's project id is irrelevant
 * to Vigilly — the transport URL is overridden by the `tunnel` and ingest auth
 * uses only the public key — so a constant numeric value is always safe. The
 * real project id is carried in the tunnel path (see `envelopeTunnelUrl`).
 */
const SENTRY_DSN_PROJECT_ID = "0";

/**
 * A Sentry-valid DSN (`<protocol>://<publicKey>@<host>/0`) synthesised from a
 * Vigilly DSN. The underlying Sentry SDK requires a (numeric) project id in the
 * DSN path even when a `tunnel` overrides the transport URL; this DSN also seeds
 * the `dsn` field of the envelope header that Vigilly ingest reads for the public
 * key. The real Vigilly project id lives in the tunnel path, not here.
 */
export function toSentryDsn(c: VigillyDsnComponents): string {
  return `${c.protocol}://${c.publicKey}@${c.host}/${SENTRY_DSN_PROJECT_ID}`;
}
