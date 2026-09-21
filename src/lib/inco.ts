import "server-only";
import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { IncoCategory } from "@/generated/prisma/client";

export { INCO_CATEGORY_LABELS, INCO_STATUS_LABELS, INCO_CATEGORIES, MAX_INCO_MESSAGE_LENGTH } from "@/lib/inco-constants";

// No look-alike characters (0/O, 1/I/L), grouped for readability when a
// student copies it down by hand. 20 real characters from a 55-character
// alphabet (~55^20 combinations) - the code is the *only* thing that can
// ever reconnect a student to their own submission, so it needs to be
// unguessable even under sustained brute-forcing, not just "hard to type
// in by accident" like the 6-character LIVE-mode join codes.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const generateRawCode = customAlphabet(CODE_ALPHABET, 20);

export function generateIncoCode(): string {
  const raw = generateRawCode();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`;
}

/**
 * One-way hash of a reference code for storage/lookup - mirrors password
 * hashing's "never store the secret itself" principle. SHA-256 (not scrypt)
 * is deliberate here: the code already carries ~117 bits of entropy from a
 * cryptographically random generator (unlike a human password), so there is
 * no offline-guessing risk a slow hash would defend against, and a fast
 * hash is what makes an indexed, O(1) lookup by code possible at all.
 */
export function hashIncoCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export async function createIncoSubmission(category: IncoCategory, message: string) {
  const code = generateIncoCode();
  const codeHash = hashIncoCode(code);
  await prisma.incoSubmission.create({ data: { category, message, codeHash } });
  return code;
}

/** Looks up a submission by its plaintext code - never by id, and never returns more than the one matching row. */
export async function findIncoSubmissionByCode(code: string) {
  return prisma.incoSubmission.findUnique({ where: { codeHash: hashIncoCode(code) } });
}
