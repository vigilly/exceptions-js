/**
 * OTLP endpoint derivation for Vigilly Observe.
 *
 * Exceptions travel over the Sentry envelope tunnel (see `dsn.ts`), but traces,
 * metrics and logs travel over OpenTelemetry's OTLP/HTTP protocol to a different
 * set of paths. This module derives those paths from the same Vigilly DSN so a
 * caller never has to hand-assemble URLs.
 *
 * Two path styles exist because the same telemetry can target two different
 * receivers:
 *
 *   - "vigilly"  (default): Vigilly Observe ingest, `<base>/{signal}/otlp`, where
 *                base is `<protocol>://<host>/api/observe/<projectId>`. This is
 *                what `vigilly.dev` serves in production.
 *   - "standard": a plain OTLP/HTTP collector, `<base>/v1/{signal}` — the paths
 *                mandated by the OTLP spec (e.g. a local Vigilly observer or any
 *                OpenTelemetry Collector listening on :4318).
 */
import type { VigillyDsnComponents } from "./dsn";

/** OTLP signal kinds Vigilly ingests. */
export type OtlpSignal = "traces" | "metrics" | "logs";

/** Path convention for the OTLP receiver — see the module docblock. */
export type OtlpPathStyle = "vigilly" | "standard";

/**
 * Base OTLP endpoint derived from a Vigilly DSN:
 * `<protocol>://<host>/api/observe/<projectId>`. Per-signal URLs are built from
 * this base by {@link otlpSignalUrl}.
 */
export function otlpBaseUrl(c: VigillyDsnComponents): string {
  return `${c.protocol}://${c.host}/api/observe/${c.projectId}`;
}

/**
 * The full OTLP/HTTP URL for one signal.
 *
 * @param base  Endpoint base — {@link otlpBaseUrl} for Vigilly ingest, or a bare
 *              collector origin (e.g. `http://127.0.0.1:4318`) for "standard".
 * @param signal  `traces` | `metrics` | `logs`.
 * @param style  Path convention; defaults to `"vigilly"`.
 */
export function otlpSignalUrl(
  base: string,
  signal: OtlpSignal,
  style: OtlpPathStyle = "vigilly",
): string {
  const b = base.replace(/\/+$/, "");
  return style === "standard" ? `${b}/v1/${signal}` : `${b}/${signal}/otlp`;
}
