/**
 * Two-level TTL cache: an in-memory Map for the current tab, mirrored to
 * localStorage so repeat visits skip the network (and AniList's rate limit).
 * Storage failures (private mode, quota) are ignored — memory still works.
 */
interface Entry<T> {
  value: T;
  expires: number;
}

const PREFIX = 'aff:cache:';
const MAX_PERSISTED = 150;
const memory = new Map<string, Entry<unknown>>();

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const now = Date.now();
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) {
    if (hit.expires > now) return hit.value;
    memory.delete(key);
  }
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.expires <= now) {
      store.removeItem(PREFIX + key);
      return undefined;
    }
    memory.set(key, entry);
    return entry.value;
  } catch {
    return undefined;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, persist = true): void {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  memory.set(key, entry);
  const store = storage();
  if (!persist || !store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(entry));
    prune(store);
  } catch {
    // Quota exceeded: drop our persisted entries and keep going in memory.
    try {
      clearPersisted(store);
    } catch {
      /* ignore */
    }
  }
}

function persistedKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

function prune(store: Storage) {
  const keys = persistedKeys(store);
  if (keys.length <= MAX_PERSISTED) return;
  const entries = keys
    .map((k) => {
      try {
        return { k, expires: (JSON.parse(store.getItem(k) ?? '{}') as Entry<unknown>).expires ?? 0 };
      } catch {
        return { k, expires: 0 };
      }
    })
    .sort((a, b) => a.expires - b.expires);
  for (const { k } of entries.slice(0, keys.length - MAX_PERSISTED)) store.removeItem(k);
}

function clearPersisted(store: Storage) {
  for (const k of persistedKeys(store)) store.removeItem(k);
}

export function cacheClear(): void {
  memory.clear();
  const store = storage();
  if (store) clearPersisted(store);
}
