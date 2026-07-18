/**
 * Detection of client-disconnect / request-abort errors.
 *
 * When a browser cancels an in-flight request (a fast reload, a navigation away,
 * a closed tab), Node surfaces the severed socket as an error — commonly
 * `Error: aborted` with an `async_hooks` stack, or an `ECONNRESET` /
 * premature-close. These are ambient network noise, not application bugs, and
 * reporting every one drowns the real signal. `initObserve` filters them out of
 * exception reporting by default (`captureAbortErrors: false`).
 */

/** True when `err` looks like a client-disconnect / aborted-request error. */
export function isRequestAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string };
  const code = String(e.code ?? "");
  return (
    e.name === "AbortError" ||
    String(e.message ?? "") === "aborted" ||
    code === "ECONNRESET" ||
    code === "ABORT_ERR" ||
    code === "ERR_STREAM_PREMATURE_CLOSE"
  );
}
