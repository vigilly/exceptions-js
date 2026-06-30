/**
 * Vigilly DSN parsing.
 *
 * A Vigilly DSN identifies a project and carries its public ingest key:
 *
 *     https://<publicKey>@<project>.vigilly.dev
 *
 * An explicit numeric/textual project id may optionally be appended as a path
 * segment (`https://<publicKey>@<project>.vigilly.dev/<projectId>`); when it is
 * omitted the project id defaults to the left-most host label (`<project>`).
 *
 * Vigilly's ingest route is `<host>/api/observe/<projectId>/envelope/`, which is
 * NOT the path a stock Sentry DSN derives (`<host>/api/<projectId>/envelope/`).
 * The wrapper bridges that gap with the SDK's `tunnel` option — see `options.ts`.
 */

export interface VigillyDsnComponents {
  /** DSN public key — used by Vigilly ingest for auth. */
  publicKey: string;
  /** URL protocol, e.g. `https`. */
  protocol: string;
  /** Full host, e.g. `myproject.vigilly.dev`. */
  host: string;
  /** Project identifier used in the ingest path. */
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

  const host = url.host; // includes port if present
  if (!host) {
    throw new InvalidVigillyDsnError(dsn, "missing host");
  }

  const protocol = url.protocol.replace(":", "");

  // Optional explicit project id from the path; otherwise the first host label.
  const pathProjectId = url.pathname.split("/").filter(Boolean).pop();
  const projectId = pathProjectId || url.hostname.split(".")[0] || "";
  if (!projectId) {
    throw new InvalidVigillyDsnError(dsn, "could not derive a project id from host or path");
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
 * validates that a DSN's project id is purely numeric, but Vigilly project ids
 * are host labels (e.g. `myproject`). The DSN's project id is irrelevant to
 * Vigilly — the transport URL is overridden by the `tunnel` and ingest auth uses
 * only the public key — so any valid numeric value works.
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
