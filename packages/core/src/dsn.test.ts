import { describe, expect, it } from "vitest";
import {
  InvalidVigillyDsnError,
  envelopeTunnelUrl,
  parseVigillyDsn,
  toSentryDsn,
} from "./index";
import { resolveVigillyOptions } from "./index";

describe("parseVigillyDsn", () => {
  it("parses the canonical DSN shape and derives the project id from the host", () => {
    const c = parseVigillyDsn("https://abc123@myproject.vigilly.dev");
    expect(c).toEqual({
      publicKey: "abc123",
      protocol: "https",
      host: "myproject.vigilly.dev",
      projectId: "myproject",
    });
  });

  it("prefers an explicit project id from the path", () => {
    const c = parseVigillyDsn("https://abc123@myproject.vigilly.dev/42");
    expect(c.projectId).toBe("42");
    expect(c.host).toBe("myproject.vigilly.dev");
  });

  it("rejects DSNs without a public key", () => {
    expect(() => parseVigillyDsn("https://myproject.vigilly.dev")).toThrow(InvalidVigillyDsnError);
  });

  it("rejects DSNs that include a secret", () => {
    expect(() => parseVigillyDsn("https://pub:secret@myproject.vigilly.dev")).toThrow(
      InvalidVigillyDsnError,
    );
  });

  it("rejects garbage", () => {
    expect(() => parseVigillyDsn("not a url")).toThrow(InvalidVigillyDsnError);
    expect(() => parseVigillyDsn("")).toThrow(InvalidVigillyDsnError);
  });
});

describe("URL derivation", () => {
  it("builds the Vigilly envelope tunnel URL", () => {
    const c = parseVigillyDsn("https://abc123@myproject.vigilly.dev");
    expect(envelopeTunnelUrl(c)).toBe(
      "https://myproject.vigilly.dev/api/observe/myproject/envelope/",
    );
  });

  it("builds a Sentry-valid DSN with a numeric placeholder project id", () => {
    const c = parseVigillyDsn("https://abc123@myproject.vigilly.dev");
    expect(toSentryDsn(c)).toBe("https://abc123@myproject.vigilly.dev/0");
  });
});

describe("resolveVigillyOptions", () => {
  it("sets dsn + tunnel and disables tracing", () => {
    const r = resolveVigillyOptions({ dsn: "https://abc123@myproject.vigilly.dev" });
    expect(r.dsn).toBe("https://abc123@myproject.vigilly.dev/0");
    expect(r.tunnel).toBe("https://myproject.vigilly.dev/api/observe/myproject/envelope/");
    expect(r.tracesSampleRate).toBe(0);
    expect(r.sampleRate).toBe(1.0);
  });

  it("forwards only provided curated options and omits unknown ones", () => {
    const r = resolveVigillyOptions({
      dsn: "https://abc123@myproject.vigilly.dev",
      release: "1.2.3",
      environment: "staging",
    });
    expect(r.release).toBe("1.2.3");
    expect(r.environment).toBe("staging");
    expect("debug" in r).toBe(false);
    // No tracing/replay leakage onto the resolved object.
    expect("replaysSessionSampleRate" in r).toBe(false);
  });
});
