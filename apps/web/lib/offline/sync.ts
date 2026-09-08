const DB_NAME = 'hospiflow_offline'
const DB_VERSION = 1
const QUEUE_STORE = 'sync_queue'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueue(action: string, payload: any) {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  tx.objectStore(QUEUE_STORE).add({ action, payload, createdAt: Date.now(), attempts: 0 })
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function drainQueue(onSync: (item: any) => Promise<boolean>) {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  const request = store.getAll()
  request.onsuccess = async () => {
    const items = request.result
    for (const item of items) {
      try {
        const ok = await onSync(item)
        if (ok) store.delete(item.id)
        else {
          item.attempts = (item.attempts || 0) + 1
          store.put(item)
        }
      } catch {
        item.attempts = (item.attempts || 0) + 1
        store.put(item)
      }
    }
  }
}

export async function isOnline() {
  return navigator.onLine
}

export function setupOnlineListener(onChange: (online: boolean) => void) {
  window.addEventListener('online', () => onChange(true))
  window.addEventListener('offline', () => onChange(false))
  return () => {
    window.removeEventListener('online', () => onChange(true))
    window.removeEventListener('offline', () => onChange(false))
  }
}
