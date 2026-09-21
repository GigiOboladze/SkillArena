import "server-only";

export const MAX_ATTACHMENTS = 2;
export const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3MB per screenshot
export const MAX_DESCRIPTION_LENGTH = 2000;

const SIGNATURES: { contentType: string; bytes: number[] }[] = [
  { contentType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { contentType: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

/**
 * Identifies an image by its actual file signature (magic bytes), not the
 * browser-supplied extension or `File.type` - both are trivially spoofable
 * client-side hints, not proof of content. Returns null for anything that
 * isn't a recognized image format.
 */
export function sniffImageContentType(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) {
      return sig.contentType;
    }
  }
  // WEBP: "RIFF" .... "WEBP" - the size field in between varies, so check
  // the two fixed anchors separately rather than one contiguous signature.
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
