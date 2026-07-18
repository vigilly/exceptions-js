/**
 * Bridge `console.*` output to OpenTelemetry logs.
 *
 * Wraps `console.{error,warn,info,log,debug}` so each call ALSO emits an OTLP
 * log record (mapped to the matching severity) while still calling through to
 * the original console method — the app's own logging is unaffected. Opt out via
 * `initObserve({ logs: { console: false } })`.
 *
 * Installed at most once; re-installing is a no-op so repeated `initObserve`
 * calls don't stack wrappers.
 */
import type { Logger } from "@opentelemetry/api-logs";
import { SeverityNumber } from "@opentelemetry/api-logs";

type ConsoleMethod = "error" | "warn" | "info" | "log" | "debug";

const SEVERITY: Record<ConsoleMethod, { number: SeverityNumber; text: string }> = {
  error: { number: SeverityNumber.ERROR, text: "ERROR" },
  warn: { number: SeverityNumber.WARN, text: "WARN" },
  info: { number: SeverityNumber.INFO, text: "INFO" },
  log: { number: SeverityNumber.INFO, text: "INFO" },
  debug: { number: SeverityNumber.DEBUG, text: "DEBUG" },
};

let installed = false;

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** Route console output through `logger` (in addition to the real console). */
export function installConsoleBridge(logger: Logger): void {
  if (installed) return;
  installed = true;

  (Object.keys(SEVERITY) as ConsoleMethod[]).forEach((method) => {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        const { number, text } = SEVERITY[method];
        logger.emit({ severityNumber: number, severityText: text, body: format(args) });
      } catch {
        // Telemetry must never break logging.
      }
      original(...args);
    };
  });
}
