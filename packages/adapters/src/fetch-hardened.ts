export interface FetchHardenedOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504, 529]);
const DEFAULT_BACKOFF = [1000, 4000, 16000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchHardened(
  url: string,
  options: FetchHardenedOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (RETRY_STATUSES.has(res.status) && attempt < maxAttempts - 1) {
        const retryAfter = res.headers.get("retry-after");
        await sleep(
          retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_BACKOFF[attempt] ?? 16000
        );
        continue;
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts - 1) {
        await sleep(DEFAULT_BACKOFF[attempt] ?? 4000);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("fetch failed");
}

export async function fetchJson<T>(
  url: string,
  options: FetchHardenedOptions = {}
): Promise<T> {
  const res = await fetchHardened(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}
