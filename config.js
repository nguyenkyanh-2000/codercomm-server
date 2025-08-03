import { webcrypto } from "node:crypto";

// Polyfill crypto for environments that don't have it globally
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

export const MOCK_ACCESS_TOKEN_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "mockaccesstoken"
);
export const MOCK_ACCESS_TOKEN_EXPIRATION = parseInt(
  process.env.JWT_EXPIRATION || "86400"
); // 1 day in seconds
