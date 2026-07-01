import { describe, expect, it, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import { deriveKey, encryptData, decryptData } from "./crypto";
import { db } from "./db";

describe("Cryptography Services", () => {
  it("should derive a key and successfully encrypt/decrypt data", async () => {
    const passphrase = "super-secret-password";
    const salt = "random-salt-string";
    const plaintext = "This is a secret debate preparation case file.";

    // Derive CryptoKey
    const key = await deriveKey(passphrase, salt);
    expect(key).toBeDefined();
    expect(key.type).toBe("secret");

    // Encrypt
    const encrypted = await encryptData(plaintext, key);
    expect(encrypted).toContain(".");
    expect(encrypted.split(".").length).toBe(2);

    // Decrypt
    const decrypted = await decryptData(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("should fail to decrypt with incorrect key or modified ciphertext", async () => {
    const passphrase = "super-secret-password";
    const salt = "random-salt-string";
    const key1 = await deriveKey(passphrase, salt);
    const key2 = await deriveKey("wrong-password", salt);

    const plaintext = "Secret Case Data";
    const encrypted = await encryptData(plaintext, key1);

    // Decrypt with wrong key should throw error
    await expect(decryptData(encrypted, key2)).rejects.toThrow();

    // Modifying encrypted text should throw error
    const modifiedEncrypted = encrypted + "abc";
    await expect(decryptData(modifiedEncrypted, key1)).rejects.toThrow();
  });
});

describe("Dexie IndexedDB Database", () => {
  beforeAll(async () => {
    // Open DB in memory (fake-indexeddb makes it memory-only and isolated)
    await db.open();
  });

  it("should store and retrieve settings", async () => {
    await db.settings.put({ key: "theme", value: "dark" });
    const setting = await db.settings.get("theme");
    expect(setting).toBeDefined();
    expect(setting?.value).toBe("dark");
  });

  it("should store and retrieve debate documents", async () => {
    const docId = "doc-123";
    const testDoc = {
      id: docId,
      name: "Affirmative Case.md",
      type: "case" as const,
      content: "# Affirmative Case\nThis is the content.",
      lastModified: Date.now()
    };

    await db.documents.put(testDoc);
    const retrieved = await db.documents.get(docId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Affirmative Case.md");
    expect(retrieved?.content).toBe(testDoc.content);
  });

  it("should store and retrieve evidence cards", async () => {
    const cardId = "card-sha256-abc";
    const testCard = {
      id: cardId,
      title: "Smith 2024 (Economy)",
      sourceUrl: "https://example.com/smith",
      text: "The US economy is growing rapidly due to technology.",
      hash: "abc-sha256-hash-value",
      timestamp: Date.now(),
      author: "Michael Y. Qiu"
    };

    await db.cards.put(testCard);
    const retrieved = await db.cards.get(cardId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe("Smith 2024 (Economy)");
    expect(retrieved?.text).toBe(testCard.text);
  });
});
