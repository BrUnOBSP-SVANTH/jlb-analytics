export async function fetchJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchWithRetry<T>(
  url: string,
  headers: Record<string, string> = {},
  maxRetries = 2,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchJSON<T>(url, headers);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("HTTP 4")) throw err;
      if (attempt < maxRetries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`[fetchWithRetry] attempt ${attempt + 1}/${maxRetries + 1} failed (${msg}), retrying in ${wait}ms…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}
