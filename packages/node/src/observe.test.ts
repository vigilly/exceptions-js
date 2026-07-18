// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { getMeter, getTracer, initObserve, shutdownObserve } from "./observe";
import { isRequestAbortError } from "./abortErrors";

const OPTS = {
  dsn: "http://public@127.0.0.1:4318/test",
  service: "test-svc",
  // Keep the test hermetic: no Sentry global setup, no console patching.
  exceptions: false as const,
  logs: false as const,
  otlp: { endpoint: "http://127.0.0.1:4318", pathStyle: "standard" as const, apiKey: "x" },
};

describe("initObserve", () => {
  afterEach(async () => {
    await shutdownObserve();
  });

  it("binds a real tracer + meter to its own providers", () => {
    initObserve(OPTS);
    // A real (recording) span has a non-zero trace id; the API no-op does not.
    const span = getTracer().startSpan("probe");
    expect(span.spanContext().traceId).not.toBe("00000000000000000000000000000000");
    span.end();
    // Meter is a real instrument factory.
    expect(typeof getMeter().createCounter).toBe("function");
  });

  it("is idempotent — a second call does not rebind the tracer", () => {
    initObserve(OPTS);
    const first = getTracer();
    expect(() => initObserve(OPTS)).not.toThrow();
    expect(getTracer()).toBe(first);
  });

  it("throws on a malformed DSN (fail-fast on config)", () => {
    expect(() => initObserve({ ...OPTS, dsn: "not a dsn" })).toThrow();
  });
});

describe("isRequestAbortError", () => {
  it("matches aborted-request shapes", () => {
    expect(isRequestAbortError(Object.assign(new Error("aborted")))).toBe(true);
    expect(isRequestAbortError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isRequestAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isRequestAbortError(Object.assign(new Error("x"), { code: "ERR_STREAM_PREMATURE_CLOSE" }))).toBe(true);
  });

  it("ignores ordinary errors and non-errors", () => {
    expect(isRequestAbortError(new Error("boom"))).toBe(false);
    expect(isRequestAbortError(null)).toBe(false);
    expect(isRequestAbortError("aborted")).toBe(false);
  });
});
