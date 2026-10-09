// Image upload handling shared by the /api/*-image route handlers. SERVER-ONLY.
//
// The routes authenticate FIRST (before the request body is read), then call
// handleImageUpload(), which:
//   - accepts only JPEG / PNG / GIF / WebP, checked by the declared MIME type
//     AND the file's magic bytes (a renamed .html / .svg is rejected)
//   - enforces the size limit (and rejects empty files)
//   - stores under a server-generated name `<uuid>.<ext>` — the extension
//     comes from the detected type, never from the client's file name, and no
//     client input reaches the storage path (no traversal)
//   - never overwrites (upsert: false); a failed upload stores nothing

import { randomUUID } from "node:crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** The image type the bytes actually are, or null. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const b = (i: number) => bytes[i];
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return "image/png";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type ImageCheck =
  | { ok: true; bytes: Uint8Array; contentType: ImageType; ext: string }
  | { ok: false; status: 400; error: string };

export async function checkImageFile(file: unknown): Promise<ImageCheck> {
  if (!(file instanceof File)) return { ok: false, status: 400, error: "파일이 없습니다." };
  if (!(file.type in IMAGE_TYPES)) return { ok: false, status: 400, error: "JPG, PNG, GIF, WEBP만 업로드 가능합니다." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, status: 400, error: "이미지 크기는 5MB 이하여야 합니다." };
  if (file.size === 0) return { ok: false, status: 400, error: "파일이 없습니다." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, status: 400, error: "이미지 크기는 5MB 이하여야 합니다." };
  const actual = sniffImageType(bytes);
  if (actual === null || actual !== file.type) return { ok: false, status: 400, error: "JPG, PNG, GIF, WEBP만 업로드 가능합니다." };
  return { ok: true, bytes, contentType: actual, ext: IMAGE_TYPES[actual] };
}

/** The subset of the Supabase storage client the upload uses (injectable for tests). */
export type ImageStorage = {
  from(bucket: string): {
    upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
};

export type UploadOutcome = { status: number; body: { url: string } | { error: string } };

/** Reads the multipart body, validates the image and stores it. Call only after authentication. */
export async function handleImageUpload(request: Request, bucket: string, storage: () => ImageStorage): Promise<UploadOutcome> {
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return { status: 400, body: { error: "파일이 없습니다." } };
  }
  const check = await checkImageFile(file);
  if (!check.ok) return { status: check.status, body: { error: check.error } };

  const filename = `${randomUUID()}.${check.ext}`;
  const bucketClient = storage().from(bucket);
  const { error } = await bucketClient.upload(filename, Buffer.from(check.bytes), { contentType: check.contentType, upsert: false });
  if (error) return { status: 500, body: { error: "이미지 업로드에 실패했습니다." } };

  return { status: 200, body: { url: bucketClient.getPublicUrl(filename).data.publicUrl } };
}
