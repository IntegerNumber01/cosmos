// Leave five seconds of the route's 60-second allowance to return a useful response.
export const CATALOGUE_BUDGET_MS = 55_000;

/** An attempt includes reading the response body and obeys the shared request deadline. */
export async function catalogueText(url: string, init: RequestInit, deadline: AbortSignal, timeoutMs: number): Promise<string> {
  deadline.throwIfAborted();
  const attempt = new AbortController();
  const signal = AbortSignal.any([deadline, attempt.signal]);
  const timer = setTimeout(() => attempt.abort(new DOMException("Catalog attempt timed out", "TimeoutError")), timeoutMs);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal, cache: "no-store" });
        if (!response.ok) {
          let detail = "";
          try {
            const body = JSON.parse(await response.text());
            const message = body.message ?? body.error;
            if (typeof message === "string") detail = `: ${message.slice(0,180)}`;
          } catch { /* Non-JSON gateway pages are not useful error messages. */ }
          throw new Error(`HTTP ${response.status}${detail}`);
        }
        return response.text();
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
