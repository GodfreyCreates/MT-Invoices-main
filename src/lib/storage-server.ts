import path from 'node:path';
import { createSupabaseAdminClient } from './supabase-server';

export const APP_STORAGE_BUCKET = 'app-images';
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

let ensureBucketPromise: Promise<void> | null = null;

function normalizeObjectPath(objectPath: string) {
  return objectPath.replace(/^\/+/, '');
}

function sanitizeFileSegment(value: string) {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'file';
}

export function assertSupportedImageUpload(file: {
  mimetype?: string;
  size?: number;
  originalname?: string;
}) {
  if (!file.mimetype || !ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error('Please choose a PNG, JPG, WEBP, or SVG image');
  }

  if ((file.size ?? 0) > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image uploads must be 4 MB or smaller');
  }
}

export function createStorageObjectPath(scope: 'site-logo' | 'company-logo', ownerId: string, originalName: string) {
  const extension = path.extname(originalName || '').toLowerCase();
  const safeExtension = extension && extension.length <= 10 ? extension : '';
  const timestamp = Date.now();
  const fileStem = sanitizeFileSegment(path.basename(originalName || 'image', extension));
  return `${scope}/${ownerId}/${timestamp}-${fileStem}${safeExtension}`;
}

export async function ensureAppStorageBucket() {
  if (!ensureBucketPromise) {
    ensureBucketPromise = (async () => {
      const supabaseAdmin = createSupabaseAdminClient();
      const { data: existingBucket, error: getBucketError } = await supabaseAdmin.storage.getBucket(APP_STORAGE_BUCKET);

      if (getBucketError && !/not found/i.test(getBucketError.message)) {
        throw getBucketError;
      }

      if (existingBucket) {
        return;
      }

      const { error: createBucketError } = await supabaseAdmin.storage.createBucket(APP_STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
        allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
      });

      if (createBucketError && !/already exists/i.test(createBucketError.message)) {
        throw createBucketError;
      }
    })().catch((error) => {
      ensureBucketPromise = null;
      throw error;
    });
  }

  return ensureBucketPromise;
}

export async function getAppStorageBucketHealth() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: bucket, error } = await supabaseAdmin.storage.getBucket(APP_STORAGE_BUCKET);

  if (error) {
    return {
      ok: false,
      exists: false,
      errorMessage: error.message,
      bucket: null,
    };
  }

  return {
    ok: Boolean(bucket),
    exists: Boolean(bucket),
    errorMessage: null,
    bucket,
  };
}

export async function uploadImageToStorage(params: {
  objectPath: string;
  contentType: string;
  file: ArrayBuffer | Buffer | Uint8Array;
}) {
  await ensureAppStorageBucket();
  const supabaseAdmin = createSupabaseAdminClient();
  const normalizedPath = normalizeObjectPath(params.objectPath);
  const { error: uploadError } = await supabaseAdmin.storage.from(APP_STORAGE_BUCKET).upload(normalizedPath, params.file, {
    contentType: params.contentType,
    cacheControl: '3600',
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseAdmin.storage.from(APP_STORAGE_BUCKET).getPublicUrl(normalizedPath);
  return {
    objectPath: normalizedPath,
    publicUrl: data.publicUrl,
  };
}

export async function deleteImageFromStorage(objectPath: string | null | undefined) {
  if (!objectPath) {
    return;
  }

  await ensureAppStorageBucket();
  const supabaseAdmin = createSupabaseAdminClient();
  const normalizedPath = normalizeObjectPath(objectPath);
  const { error } = await supabaseAdmin.storage.from(APP_STORAGE_BUCKET).remove([normalizedPath]);

  if (error && !/not found/i.test(error.message)) {
    throw error;
  }
}
