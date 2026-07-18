import { describe, expect, it } from "vitest";
import {
  InvalidVigillyDsnError,
  envelopeTunnelUrl,
  parseVigillyDsn,
  toSentryDsn,
} from "./index";
import { resolveVigillyOptions } from "./index";

describe("parseVigillyDsn", () => {
  it("parses the canonical Sentry-shaped DSN with the host used as-is", () => {
    const c = parseVigillyDsn("https://abc123@vigilly.dev/42");
    expect(c).toEqual({
      publicKey: "abc123",
      protocol: "https",
      host: "vigilly.dev",
      projectId: "42",
    });
  });

  it("uses the host as-is for non-prod ingest hosts", () => {
    const c = parseVigillyDsn("https://abc123@staging.vigilly.dev/42");
    expect(c.host).toBe("staging.vigilly.dev");
    expect(c.projectId).toBe("42");
  });

  it("parses the canonical /api/observe/<slug> path (real Vigilly DSN shape)", () => {
    const c = parseVigillyDsn(
      "https://b6dd25a9689f8652a1963c4a38867141@vigilly.dev/api/observe/kavaro-uyz21",
    );
    expect(c).toEqual({
      publicKey: "b6dd25a9689f8652a1963c4a38867141",
      protocol: "https",
      host: "vigilly.dev",
      projectId: "kavaro-uyz21",
    });
    expect(envelopeTunnelUrl(c)).toBe("https://vigilly.dev/api/observe/kavaro-uyz21/envelope/");
  });

  it("rejects DSNs without a project id path segment", () => {
    expect(() => parseVigillyDsn("https://abc123@vigilly.dev")).toThrow(InvalidVigillyDsnError);
  });

  it("rejects DSNs without a public key", () => {
    expect(() => parseVigillyDsn("https://vigilly.dev/42")).toThrow(InvalidVigillyDsnError);
  });

  it("rejects DSNs that include a secret", () => {
    expect(() => parseVigillyDsn("https://pub:secret@vigilly.dev/42")).toThrow(
      InvalidVigillyDsnError,
    );
  });

  it("rejects garbage", () => {
    expect(() => parseVigillyDsn("not a url")).toThrow(InvalidVigillyDsnError);
    expect(() => parseVigillyDsn("")).toThrow(InvalidVigillyDsnError);
  });
});

describe("URL derivation", () => {
  it("builds the Vigilly envelope tunnel URL from the bare host + path projectId", () => {
    const c = parseVigillyDsn("https://abc123@vigilly.dev/42");
    expect(envelopeTunnelUrl(c)).toBe("https://vigilly.dev/api/observe/42/envelope/");
  });

  it("builds a Sentry-valid DSN with a numeric placeholder project id", () => {
    const c = parseVigillyDsn("https://abc123@vigilly.dev/42");
    expect(toSentryDsn(c)).toBe("https://abc123@vigilly.dev/0");
  });
});

describe("resolveVigillyOptions", () => {
  it("sets dsn + tunnel and disables tracing", () => {
    const r = resolveVigillyOptions({ dsn: "https://abc123@vigilly.dev/42" });
    expect(r.dsn).toBe("https://abc123@vigilly.dev/0");
    expect(r.tunnel).toBe("https://vigilly.dev/api/observe/42/envelope/");
    expect(r.tracesSampleRate).toBe(0);
    expect(r.sampleRate).toBe(1.0);
  });

  it("forwards only provided curated options and omits unknown ones", () => {
    const r = resolveVigillyOptions({
      dsn: "https://abc123@vigilly.dev/42",
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
