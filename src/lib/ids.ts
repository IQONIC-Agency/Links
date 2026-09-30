import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** 10 chars from a 32-char alphabet = 50 bits, so /r/<id> cannot be enumerated. */
export function randomId(len = 10): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! & 31];
  return out;
}
