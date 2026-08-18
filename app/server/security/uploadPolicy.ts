export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const ALLOWED_SUPPORT_MIMES = new Set([
  ...Array.from(ALLOWED_IMAGE_MIMES),
  "application/pdf",
]);

export type UploadScope = "avatar" | "support" | "template";

export class UnsafeUploadError extends Error {}

type UploadCandidate = {
  mimetype: string;
  buffer?: Buffer;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 50 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isAllowedUploadMime(scope: UploadScope, mimetype: string): boolean {
  return (scope === "support" ? ALLOWED_SUPPORT_MIMES : ALLOWED_IMAGE_MIMES).has(mimetype.toLowerCase());
}

export function getUploadLimit(scope: UploadScope): number {
  if (scope === "avatar") return MAX_AVATAR_BYTES;
  if (scope === "template") return 10 * 1024 * 1024;
  return MAX_SUPPORT_BYTES;
}

function hasExpectedSignature(mimetype: string, buffer: Buffer): boolean {
  if (mimetype === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === "image/gif") return buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a");
  if (mimetype === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimetype === "application/pdf") return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

export function assertAllowedUpload(scope: UploadScope, file: UploadCandidate): void {
  const mimetype = file.mimetype.toLowerCase();
  if (!isAllowedUploadMime(scope, mimetype)) {
    throw new UnsafeUploadError("نوع الملف غير مسموح به");
  }
  if (!file.buffer || file.buffer.length === 0 || file.buffer.length > getUploadLimit(scope)) {
    throw new UnsafeUploadError("حجم الملف غير صالح");
  }
  if (!hasExpectedSignature(mimetype, file.buffer)) {
    throw new UnsafeUploadError("محتوى الملف لا يطابق نوعه المعلن");
  }
}

export function createSafeUploadKey(scope: UploadScope, mimetype: string, randomId: string): string {
  const extension = EXTENSION_BY_MIME[mimetype.toLowerCase()];
  if (!extension || !isAllowedUploadMime(scope, mimetype)) {
    throw new UnsafeUploadError("نوع الملف غير مسموح به");
  }
  return `${scope}/${randomId}.${extension}`;
}
