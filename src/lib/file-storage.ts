/**
 * IndexedDB-based file storage for uploaded documents.
 * Stores actual file content (as ArrayBuffer) alongside metadata.
 * Falls back to in-memory storage if IndexedDB is unavailable.
 */

const DB_NAME = "wallnut_files";
const DB_VERSION = 1;
const STORE_NAME = "files";

export interface StoredFile {
  id: string;
  projectId: string;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
  uploadedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

// In-memory fallback
const memoryStore = new Map<string, StoredFile>();

export async function storeFile(file: File, projectId: string): Promise<StoredFile> {
  const stored: StoredFile = {
    id: crypto.randomUUID(),
    projectId,
    name: file.name,
    type: file.type,
    size: file.size,
    data: await file.arrayBuffer(),
    uploadedAt: new Date().toISOString(),
  };

  if (!isIndexedDBAvailable()) {
    memoryStore.set(stored.id, stored);
    return stored;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stored);
    tx.oncomplete = () => resolve(stored);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(id: string): Promise<StoredFile | null> {
  if (!isIndexedDBAvailable()) {
    return memoryStore.get(id) ?? null;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getFilesByProject(projectId: string): Promise<StoredFile[]> {
  if (!isIndexedDBAvailable()) {
    return Array.from(memoryStore.values()).filter(f => f.projectId === projectId);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("projectId");
    const request = index.getAll(projectId);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFile(id: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    memoryStore.delete(id);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFilesByProject(projectId: string): Promise<void> {
  const files = await getFilesByProject(projectId);
  for (const f of files) {
    await deleteFile(f.id);
  }
}

export async function getFileAsBlob(id: string): Promise<Blob | null> {
  const file = await getFile(id);
  if (!file) return null;
  return new Blob([file.data], { type: file.type });
}

export async function getFileAsText(id: string): Promise<string | null> {
  const file = await getFile(id);
  if (!file) return null;
  return new TextDecoder().decode(file.data);
}

export async function getTotalStorageUsed(): Promise<number> {
  if (!isIndexedDBAvailable()) {
    let total = 0;
    for (const f of memoryStore.values()) total += f.size;
    return total;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const files = request.result as StoredFile[];
      resolve(files.reduce((sum, f) => sum + f.size, 0));
    };
    request.onerror = () => reject(request.error);
  });
}
