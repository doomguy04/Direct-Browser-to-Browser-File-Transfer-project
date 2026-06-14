const DB_NAME = 'P2PWebShareDB';
const STORE_NAME = 'chunks';
const DB_VERSION = 1;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveChunk(roomId, index, data) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Ensure we store it as a Blob for RAM safety (blobs are stored on disk by browser engine)
    const chunkBlob = data instanceof Blob ? data : new Blob([data]);
    
    const request = store.put({
      id: `${roomId}_${index}`,
      roomId,
      index,
      data: chunkBlob
    });

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getChunksCount(roomId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    let count = 0;
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.roomId === roomId) {
          count++;
        }
        cursor.continue();
      } else {
        resolve(count);
      }
    };
    
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getChunks(roomId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const chunks = [];

    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.roomId === roomId) {
          chunks.push(cursor.value);
        }
        cursor.continue();
      } else {
        // Sort chunks by index to guarantee correct file assembly
        chunks.sort((a, b) => a.index - b.index);
        resolve(chunks.map(c => c.data));
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

export async function clearRoom(roomId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.roomId === roomId) {
          store.delete(cursor.key);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}
