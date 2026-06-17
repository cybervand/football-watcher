// =============================================================================
// SUMMARY CACHE — IndexedDB
// -----------------------------------------------------------------------------
// Persists built match summaries (NIFS recap + translated goal lines) so we
// never re-fetch NIFS or re-run the NO->EN translation for a match we've already
// summarized. IndexedDB is browser-native (no server) and reads are instant, so
// this is the fastest way to "always have it once it comes in".
//
// Only FINAL summaries are stored permanently: a finished match's recap won't
// change, so it's safe to keep forever. Fallback summaries (no NIFS recap yet,
// Wikipedia-only) are NOT cached, so they get retried until a real recap exists.
// =============================================================================

const DB_NAME = 'wc-watcher'
const DB_VERSION = 1
const STORE = 'summaries'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Stable per-match key: NIFS id if we have it, else the team pair. Independent
// of side order so it matches regardless of home/away.
export function summaryKey(match) {
  if (match?.nifsId != null) return `nifs:${match.nifsId}`
  const pair = [match?.team1, match?.team2]
    .filter(Boolean)
    .map((t) => t.toLowerCase().trim())
    .sort()
    .join('::')
  return pair ? `pair:${pair}` : null
}

export async function getCachedSummary(key) {
  if (!key) return null
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result?.data ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null // cache miss on any error — caller falls back to building fresh
  }
}

export async function putCachedSummary(key, data) {
  if (!key || !data) return
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, data, savedAt: new Date().toISOString() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Persisting is best-effort; a failure here must never break the summary UI.
  }
}
