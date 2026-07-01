import { invoke } from "@tauri-apps/api/core";

// Helper to check if we are running in Tauri Desktop environment
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

/**
 * Secure Key Manager
 * Handles storing, retrieving, and deleting API keys/tokens.
 * Automatically delegates to native OS Keychain in Tauri, or falls back to browser storage.
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
    localStorage.setItem(`${SERVICE_NAME}_${key}`, value);
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
    return localStorage.getItem(`${SERVICE_NAME}_${key}`);
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
