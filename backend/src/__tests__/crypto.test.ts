import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../lib/crypto.js";

describe("crypto", () => {
  it("encrypts and decrypts text correctly", () => {
    const plaintext = JSON.stringify({ email: "test@example.com", password: "secret123" });
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext", () => {
    const plaintext = "same text";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });
});
