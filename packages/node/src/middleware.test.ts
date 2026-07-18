// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { normalizeRoute, observeRequestMiddleware } from "./middleware";

describe("normalizeRoute", () => {
  it("collapses numeric, cuid and uuid segments to :id", () => {
    expect(normalizeRoute("/users/123")).toBe("/users/:id");
    expect(normalizeRoute("/o/clh1a2b3c4d5e6f7g8h9i0jk/edit")).toBe("/o/:id/edit");
    expect(normalizeRoute("/t/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe("/t/:id");
  });

  it("caps depth and keeps static segments", () => {
    expect(normalizeRoute("/a/b/c/d/e/f/g")).toBe("/a/b/c/d/e");
    expect(normalizeRoute("/api/health")).toBe("/api/health");
  });
});

function fakeTelemetry() {
  const span = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
  const histogram = { record: vi.fn() };
  const counter = { add: vi.fn() };
  return {
    span,
    histogram,
    counter,
    tracer: { startSpan: vi.fn(() => span) } as any,
    meter: { createHistogram: () => histogram, createCounter: () => counter } as any,
  };
}

function fakeRes(): any {
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.writableFinished = false;
  return res;
}

describe("observeRequestMiddleware", () => {
  it("creates a SERVER span with a normalised name and calls next", () => {
    const t = fakeTelemetry();
    const mw = observeRequestMiddleware({ tracer: t.tracer, meter: t.meter });
    const next = vi.fn();
    mw({ method: "get", url: "/users/42?q=1" } as any, fakeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(t.tracer.startSpan).toHaveBeenCalledWith("GET /users/:id", expect.objectContaining({
      attributes: expect.objectContaining({ "http.route": "/users/:id", "url.path": "/users/42" }),
    }));
  });

  it("records duration + count and ends the span on finish", () => {
    const t = fakeTelemetry();
    const mw = observeRequestMiddleware({ tracer: t.tracer, meter: t.meter });
    const res = fakeRes();
    mw({ method: "GET", url: "/x" } as any, res, () => {});

    res.statusCode = 204;
    res.writableFinished = true;
    res.emit("finish");

    expect(t.histogram.record).toHaveBeenCalledTimes(1);
    expect(t.counter.add).toHaveBeenCalledWith(1, expect.objectContaining({ "http.response.status_code": 204 }));
    expect(t.span.end).toHaveBeenCalledTimes(1);
  });

  it("marks 5xx responses as errored and ends only once", () => {
    const t = fakeTelemetry();
    const mw = observeRequestMiddleware({ tracer: t.tracer, meter: t.meter });
    const res = fakeRes();
    mw({ method: "GET", url: "/boom" } as any, res, () => {});

    res.statusCode = 500;
    res.writableFinished = true;
    res.emit("finish");
    res.emit("close"); // must not double-end

    expect(t.span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: expect.anything() }));
    expect(t.span.end).toHaveBeenCalledTimes(1);
  });

  it("skips ignored paths without a span", () => {
    const t = fakeTelemetry();
    const mw = observeRequestMiddleware({ tracer: t.tracer, meter: t.meter });
    const next = vi.fn();
    mw({ method: "GET", url: "/favicon.ico" } as any, fakeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(t.tracer.startSpan).not.toHaveBeenCalled();
  });
});
