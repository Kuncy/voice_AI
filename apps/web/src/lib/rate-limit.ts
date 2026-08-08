type RateBucket = { count: number; resetsAt: number };

const buckets = new Map<string, RateBucket>();
let lastSweepAt = 0;

export type HeaderReader = { headers: { get(name: string): string | null } };

export function clientAddress(request: HeaderReader): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER?.toLowerCase() || "x-real-ip";
  const value = request.headers.get(header)?.trim();
  return value || "unknown";
}

function sweepExpired(now: number): void {
  if (now - lastSweepAt < 60_000 && buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetsAt <= now) buckets.delete(key);
  }
  lastSweepAt = now;
}

export function consumeRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  sweepExpired(now);
  const bucketKey = `${scope}:${key}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetsAt <= now) {
    buckets.set(bucketKey, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function clearRateLimitsForTest(): void {
  buckets.clear();
  lastSweepAt = 0;
}
