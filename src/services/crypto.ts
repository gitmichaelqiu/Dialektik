import { invoke } from "@tauri-apps/api/core";

// Helper to check if we are running in Tauri Desktop environment
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
};

// Convert string to Uint8Array
const encoder = new TextEncoder();
// Convert Uint8Array to string
const decoder = new TextDecoder();

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a CryptoKey using PBKDF2 from a passphrase and a salt.
 */
export async function deriveKey(passphrase: string, saltStr: string): Promise<CryptoKey> {
  const passphraseBytes = encoder.encode(passphrase);
  const saltBytes = encoder.encode(saltStr);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    passphraseBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey", "deriveBits"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // not extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-GCM 256-bit key.
 * Returns a serialized format: base64(iv).base64(ciphertext)
 */
export async function encryptData(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encodedText
  );

  const ivBase64 = bufferToBase64(iv.buffer);
  const ciphertextBase64 = bufferToBase64(ciphertextBuffer);

  return `${ivBase64}.${ciphertextBase64}`;
}

/**
 * Decrypts serialized data: base64(iv).base64(ciphertext) using AES-GCM.
 */
export async function decryptData(encryptedStr: string, key: CryptoKey): Promise<string> {
  const parts = encryptedStr.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted format");
  }

  const iv = base64ToBytes(parts[0]);
  const ciphertext = base64ToBytes(parts[1]);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    ciphertext
  );

  return decoder.decode(decryptedBuffer);
}

// Credentials service keys
const SERVICE_NAME = "dialektik_secure_store";
const FALLBACK_DB_NAME = "DialektikSecureKeyStore";
const FALLBACK_DB_VERSION = 1;
const FALLBACK_STORE_NAME = "keys";

function openFallbackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FALLBACK_DB_NAME, FALLBACK_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FALLBACK_STORE_NAME)) {
        db.createObjectStore(FALLBACK_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredFallbackKey(): Promise<CryptoKey | null> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE_NAME, "readonly");
    const request = tx.objectStore(FALLBACK_STORE_NAME).get("credential_wrap_key");
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function storeFallbackKey(key: CryptoKey): Promise<void> {
  const db = await openFallbackDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FALLBACK_STORE_NAME, "readwrite");
    tx.objectStore(FALLBACK_STORE_NAME).put(key, "credential_wrap_key");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getFallbackKey(): Promise<CryptoKey> {
  const existing = await getStoredFallbackKey();
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  await storeFallbackKey(key);
  return key;
}

async function encryptFallbackSecret(value: string): Promise<string> {
  const key = await getFallbackKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );

  return JSON.stringify({
    version: 1,
    alg: "AES-GCM",
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext)
  });
}

async function decryptFallbackSecret(serialized: string): Promise<string> {
  const payload = JSON.parse(serialized) as { version: number; iv: string; ciphertext: string };
  if (payload.version !== 1 || !payload.iv || !payload.ciphertext) {
    throw new Error("Invalid encrypted credential payload");
  }

  const key = await getFallbackKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext)
  );
  return decoder.decode(plaintext);
}

async function setFallbackCredential(key: string, value: string): Promise<void> {
  const encrypted = await encryptFallbackSecret(value);
  localStorage.setItem(`${SERVICE_NAME}_${key}`, encrypted);
}

async function getFallbackCredential(key: string): Promise<string | null> {
  const stored = localStorage.getItem(`${SERVICE_NAME}_${key}`);
  if (!stored) return null;

  try {
    return await decryptFallbackSecret(stored);
  } catch {
    // Legacy plaintext fallback migration from older app versions.
    await setFallbackCredential(key, stored);
    return stored;
  }
}

/**
 * Secure Key Manager
 * Handles storing, retrieving, and deleting API keys/tokens.
 * Automatically delegates to native OS Keychain in Tauri, or falls back to encrypted browser storage.
 */
export const KeyManager = {
  async set(key: string, value: string): Promise<void> {
    if (isTauri()) {
      try {
        await invoke("store_credential", { service: SERVICE_NAME, key, value });
        return;
      } catch (err) {
        console.error("Tauri store_credential failed, falling back to localStorage", err);
      }
    }
    await setFallbackCredential(key, value);
  },

  async get(key: string): Promise<string | null> {
    if (isTauri()) {
      try {
        const val = await invoke<string>("get_credential", { service: SERVICE_NAME, key });
        return val;
      } catch (err) {
        console.error("Tauri get_credential failed, checking localStorage", err);
      }
    }
    return getFallbackCredential(key);
  },

  async delete(key: string): Promise<void> {
    if (isTauri()) {
      try {
        await invoke("delete_credential", { service: SERVICE_NAME, key });
        return;
      } catch (err) {
        console.error("Tauri delete_credential failed, checking localStorage", err);
      }
    }
    localStorage.removeItem(`${SERVICE_NAME}_${key}`);
  }
};
