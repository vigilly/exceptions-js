// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseVigillyDsn } from "./dsn";
import { otlpBaseUrl, otlpSignalUrl } from "./otlp";

describe("@vigilly/core otlp", () => {
  it("derives the vigilly OTLP base from a DSN", () => {
    const c = parseVigillyDsn("https://abc123@vigilly.dev/kavaro");
    expect(otlpBaseUrl(c)).toBe("https://vigilly.dev/api/observe/kavaro");
  });

  it("preserves protocol, host:port for local/dev DSNs", () => {
    const c = parseVigillyDsn("http://public@127.0.0.1:4318/kavaro");
    expect(otlpBaseUrl(c)).toBe("http://127.0.0.1:4318/api/observe/kavaro");
  });

  it("builds vigilly-style signal URLs by default", () => {
    const base = "https://vigilly.dev/api/observe/kavaro";
    expect(otlpSignalUrl(base, "traces")).toBe(`${base}/traces/otlp`);
    expect(otlpSignalUrl(base, "metrics")).toBe(`${base}/metrics/otlp`);
    expect(otlpSignalUrl(base, "logs")).toBe(`${base}/logs/otlp`);
  });

  it("builds standard OTLP spec paths when asked", () => {
    const base = "http://127.0.0.1:4318";
    expect(otlpSignalUrl(base, "traces", "standard")).toBe("http://127.0.0.1:4318/v1/traces");
    expect(otlpSignalUrl(base, "logs", "standard")).toBe("http://127.0.0.1:4318/v1/logs");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(otlpSignalUrl("http://x:4318/", "metrics", "standard")).toBe("http://x:4318/v1/metrics");
    expect(otlpSignalUrl("https://vigilly.dev/api/observe/k/", "traces")).toBe(
      "https://vigilly.dev/api/observe/k/traces/otlp",
    );
  });
});
