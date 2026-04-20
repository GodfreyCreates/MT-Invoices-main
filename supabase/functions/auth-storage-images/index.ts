import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  createAdminClient,
  HttpError,
  requireAuthUser,
  syncAppUser,
} from '../_shared/auth.ts';

const APP_STORAGE_BUCKET = 'app-images';
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

type UploadTarget = 'site-logo' | 'company-logo';

function sanitizeFileSegment(value: string) {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'file';
}

function normalizeObjectPath(value: string) {
  return value.replace(/^\/+/, '');
}

function requireTarget(value: FormDataEntryValue | string | null): UploadTarget {
  if (value === 'site-logo' || value === 'company-logo') {
    return value;
  }

  throw new HttpError(400, 'Invalid upload target');
}

function requireCompanyId(value: FormDataEntryValue | string | null) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Company id is required');
  }

  return value.trim();
}

function requireAction(value: string | null) {
  if (value === 'delete') {
    return value;
  }

  throw new HttpError(400, 'Invalid storage action');
}

function createStorageObjectPath(scope: UploadTarget, ownerId: string, originalName: string) {
  const parts = originalName.split('.');
  const extension = parts.length > 1 ? `.${parts.pop()?.toLowerCase() ?? ''}` : '';
  const safeExtension = extension.length > 1 && extension.length <= 10 ? extension : '';
  const fileStem = sanitizeFileSegment(parts.join('.') || 'image');
  const pathPrefix = scope === 'site-logo' ? 'site-logo' : 'company-logo';
  return `${pathPrefix}/${ownerId}/${Date.now()}-${fileStem}${safeExtension}`;
}

async function ensureStorageBucket(adminClient: ReturnType<typeof createAdminClient>) {
  const { data: existingBucket, error: getBucketError } = await adminClient.storage.getBucket(
    APP_STORAGE_BUCKET,
  );

  if (getBucketError && !/not found/i.test(getBucketError.message)) {
    throw new HttpError(500, getBucketError.message);
  }

  if (existingBucket) {
    return;
  }

  const { error: createBucketError } = await adminClient.storage.createBucket(APP_STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
    allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
  });

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw new HttpError(500, createBucketError.message);
  }
}

function assertValidImage(file: File) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new HttpError(400, 'Please choose a PNG, JPG, WEBP, or SVG image');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new HttpError(400, 'Image uploads must be 4 MB or smaller');
  }
}

async function removeStoredObject(
  adminClient: ReturnType<typeof createAdminClient>,
  objectPath: string | null | undefined,
) {
  if (!objectPath) {
    return;
  }

  const { error } = await adminClient.storage
    .from(APP_STORAGE_BUCKET)
    .remove([normalizeObjectPath(objectPath)]);

  if (error && !/not found/i.test(error.message)) {
    throw new HttpError(500, error.message);
  }
}

async function requireCompanyAccess(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  userRole: string,
  companyId: string,
) {
  if (userRole === 'admin') {
    const { data: company, error } = await adminClient
      .from('companies')
      .select('id, document_logo_key')
      .eq('id', companyId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, error.message);
    }

    if (!company) {
      throw new HttpError(404, 'Company not found');
    }

    return company;
  }

  const { data: membership, error } = await adminClient
    .from('company_memberships')
    .select('role, company:companies!inner(id, document_logo_key)')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!membership?.company) {
    throw new HttpError(404, 'Company not found');
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new HttpError(403, 'Only company owners or admins can manage the company logo');
  }

  const company = Array.isArray(membership.company) ? membership.company[0] : membership.company;
  return company;
}

async function uploadSiteLogo(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  file: File,
) {
  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('user')
    .select('site_logo_key')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfileError) {
    throw new HttpError(500, existingProfileError.message);
  }

  const objectPath = createStorageObjectPath('site-logo', userId, file.name);
  const { error: uploadError } = await adminClient.storage
    .from(APP_STORAGE_BUCKET)
    .upload(objectPath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new HttpError(500, uploadError.message);
  }

  const { data } = adminClient.storage.from(APP_STORAGE_BUCKET).getPublicUrl(objectPath);

  const { error: updateError } = await adminClient
    .from('user')
    .update({
      site_logo_key: objectPath,
      site_logo_url: data.publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    await removeStoredObject(adminClient, objectPath);
    throw new HttpError(500, updateError.message);
  }

  await removeStoredObject(adminClient, existingProfile?.site_logo_key);

  return {
    target: 'site-logo',
    publicUrl: data.publicUrl,
    objectPath,
  };
}

async function uploadCompanyLogo(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  userRole: string,
  companyId: string,
  file: File,
) {
  const company = await requireCompanyAccess(adminClient, userId, userRole, companyId);
  const objectPath = createStorageObjectPath('company-logo', companyId, file.name);
  const { error: uploadError } = await adminClient.storage
    .from(APP_STORAGE_BUCKET)
    .upload(objectPath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new HttpError(500, uploadError.message);
  }

  const { data } = adminClient.storage.from(APP_STORAGE_BUCKET).getPublicUrl(objectPath);
  const { error: updateError } = await adminClient
    .from('companies')
    .update({
      document_logo_key: objectPath,
      document_logo_url: data.publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (updateError) {
    await removeStoredObject(adminClient, objectPath);
    throw new HttpError(500, updateError.message);
  }

  await removeStoredObject(adminClient, company.document_logo_key);

  return {
    target: 'company-logo',
    publicUrl: data.publicUrl,
    objectPath,
    companyId,
  };
}

async function deleteSiteLogo(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('user')
    .select('site_logo_key')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfileError) {
    throw new HttpError(500, existingProfileError.message);
  }

  const { error: updateError } = await adminClient
    .from('user')
    .update({
      site_logo_key: null,
      site_logo_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  await removeStoredObject(adminClient, existingProfile?.site_logo_key);

  return {
    target: 'site-logo',
    publicUrl: null,
    objectPath: null,
  };
}

async function deleteCompanyLogo(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  userRole: string,
  companyId: string,
) {
  const company = await requireCompanyAccess(adminClient, userId, userRole, companyId);
  const { error: updateError } = await adminClient
    .from('companies')
    .update({
      document_logo_key: null,
      document_logo_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (updateError) {
    throw new HttpError(500, updateError.message);
  }

  await removeStoredObject(adminClient, company.document_logo_key);

  return {
    target: 'company-logo',
    publicUrl: null,
    objectPath: null,
    companyId,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user } = await requireAuthUser(req);
    const profile = await syncAppUser(user);
    const adminClient = createAdminClient();
    await ensureStorageBucket(adminClient);

    if (req.method === 'POST') {
      const formData = await req.formData();
      const target = requireTarget(formData.get('target'));
      const fileEntry = formData.get('file');

      if (!(fileEntry instanceof File)) {
        throw new HttpError(400, 'Image file is required');
      }

      assertValidImage(fileEntry);

      const payload =
        target === 'site-logo'
          ? await uploadSiteLogo(adminClient, profile.id, fileEntry)
          : await uploadCompanyLogo(
              adminClient,
              profile.id,
              profile.role,
              requireCompanyId(formData.get('companyId')),
              fileEntry,
            );

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (req.method === 'DELETE') {
      const payload = await req.json().catch(() => ({} as Record<string, unknown>));
      const action = requireAction(typeof payload.action === 'string' ? payload.action : null);
      if (action !== 'delete') {
        throw new HttpError(400, 'Invalid storage action');
      }

      const target = requireTarget(typeof payload.target === 'string' ? payload.target : null);
      const responsePayload =
        target === 'site-logo'
          ? await deleteSiteLogo(adminClient, profile.id)
          : await deleteCompanyLogo(
              adminClient,
              profile.id,
              profile.role,
              requireCompanyId(typeof payload.companyId === 'string' ? payload.companyId : null),
            );

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (error) {
    if (error instanceof HttpError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    console.error('auth-storage-images failure', error);
    return new Response(JSON.stringify({ error: 'Failed to manage image upload' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
