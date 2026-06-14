// Utilities for zero-knowledge AES-GCM encryption and SHA-256 verification.

// Generate a random 256-bit AES-GCM key
export async function generateKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// Export a CryptoKey to a Hex string (for URL hash usage)
export async function exportKeyToHex(key) {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  const bytes = new Uint8Array(exported);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Import a CryptoKey from a Hex string
export async function importKeyFromHex(hexString) {
  if (!hexString || hexString.length !== 64) {
    throw new Error('Invalid encryption key length');
  }
  const bytes = new Uint8Array(
    hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );
  return await window.crypto.subtle.importKey(
    'raw',
    bytes.buffer,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a single chunk of data (ArrayBuffer)
// Returns a combined ArrayBuffer: [12-byte IV] + [encrypted data]
export async function encryptChunk(arrayBuffer, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    arrayBuffer
  );

  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return combined.buffer;
}

// Decrypt a single chunk of data (ArrayBuffer)
// Receives: [12-byte IV] + [encrypted data]
export async function decryptChunk(combinedBuffer, key) {
  const iv = new Uint8Array(combinedBuffer, 0, 12);
  const ciphertext = new Uint8Array(combinedBuffer, 12);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );
  return decrypted;
}

// Calculate SHA-256 hash of a Blob / File
export async function calculateSHA256(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}
