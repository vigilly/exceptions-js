// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTransport } from "@sentry/browser";
import * as Vigilly from "./index";

/**
 * A capturing Sentry transport built on the SDK's own `createTransport`, so the
 * envelope is serialized exactly as it would be on the wire. Records the
 * transport URL the SDK resolved (the Vigilly tunnel) and the serialized
 * envelope bodies it sent.
 */
function makeCapturingTransport(capture: { url?: string; bodies: string[] }) {
  return (transportOptions: any) => {
    capture.url = transportOptions.url;
    return createTransport(transportOptions, async (request: { body: string | Uint8Array }) => {
      const body =
        typeof request.body === "string"
          ? request.body
          : new TextDecoder().decode(request.body);
      capture.bodies.push(body);
      return { statusCode: 200 };
    });
  };
}

describe("@vigilly/browser routing", () => {
  afterEach(async () => {
    await Vigilly.close(2000);
  });

  it("routes init + captureException to the Vigilly envelope URL with the DSN key", async () => {
    const capture: { url?: string; bodies: string[] } = { bodies: [] };

    Vigilly.init({
      dsn: "https://abc123@myproject.vigilly.dev",
      transport: makeCapturingTransport(capture),
    });

    Vigilly.captureException(new Error("boom"));
    await Vigilly.flush(2000);

    // The transport URL must be Vigilly's ingest route, not Sentry's default.
    expect(capture.url).toBe(
      "https://myproject.vigilly.dev/api/observe/myproject/envelope/",
    );

    // An envelope carrying the DSN public key (for ingest auth) was sent.
    expect(capture.bodies.length).toBeGreaterThan(0);
    const envelope = capture.bodies.join("\n");
    expect(envelope).toContain("abc123@myproject.vigilly.dev");
    expect(envelope).toContain("boom");
  });
});
