// Shared charset/length constants for temporary passwords — deliberately
// runtime-agnostic (no node:crypto, no DOM crypto) so both admin-repository.ts
// (server, node:crypto randomInt) and the client-side "Generate Ulang"
// control (browser, crypto.getRandomValues) draw from exactly one definition
// instead of two copies that could silently drift apart.
export const TEMPORARY_PASSWORD_LENGTH = 20;
// No 0/O/1/I/l — avoids characters an owner reading this off a screen to
// someone else could easily transcribe wrong.
export const TEMPORARY_PASSWORD_CHARSET =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
