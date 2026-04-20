import { createClient, type User } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireEnv(name: string, value: string) {
  if (!value) {
    throw new HttpError(500, `Missing required function environment variable: ${name}`);
  }

  return value;
}

export function createAdminClient() {
  return createClient(
    requireEnv('SUPABASE_URL', supabaseUrl),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function createRequestClient(authorization: string) {
  return createClient(
    requireEnv('SUPABASE_URL', supabaseUrl),
    requireEnv('SUPABASE_ANON_KEY', supabaseAnonKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );
}

export function getAuthorizationHeader(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    throw new HttpError(401, 'Missing authorization header');
  }

  return authorization;
}

function getUserName(user: User) {
  const metadataName = user.user_metadata?.name;
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  if (user.email) {
    const [localPart] = user.email.split('@');
    if (localPart?.trim()) {
      return localPart.trim();
    }
  }

  return 'User';
}

async function resolveRole(
  adminClient: ReturnType<typeof createAdminClient>,
  authUser: User,
  existingRole?: string | null,
) {
  if (existingRole) {
    return existingRole;
  }

  const metadataRole = authUser.app_metadata?.role;
  if (typeof metadataRole === 'string' && metadataRole.trim()) {
    return metadataRole.trim();
  }

  const { count, error } = await adminClient
    .from('user')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return (count ?? 0) === 0 ? 'admin' : 'user';
}

export async function requireAuthUser(req: Request) {
  const authorization = getAuthorizationHeader(req);
  const requestClient = createRequestClient(authorization);
  const {
    data: { user },
    error,
  } = await requestClient.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, error?.message ?? 'Invalid session');
  }

  return { authorization, requestClient, user };
}

export async function syncAppUser(authUser: User) {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();
  const email = authUser.email?.trim().toLowerCase();

  if (!email) {
    throw new HttpError(400, 'Authenticated user does not have an email address');
  }

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('user')
    .select('id, email, name, role, email_verified, image')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existingProfileError) {
    throw new HttpError(500, existingProfileError.message);
  }

  const role = await resolveRole(adminClient, authUser, existingProfile?.role ?? null);
  const profilePayload = {
    id: authUser.id,
    email,
    name: getUserName(authUser),
    role,
    email_verified: Boolean(authUser.email_confirmed_at),
    image:
      typeof authUser.user_metadata?.avatar_url === 'string'
        ? authUser.user_metadata.avatar_url
        : null,
    last_seen_at: now,
    updated_at: now,
  };

  if (existingProfile) {
    const { error: updateError } = await adminClient
      .from('user')
      .update(profilePayload)
      .eq('id', authUser.id);

    if (updateError) {
      throw new HttpError(500, updateError.message);
    }
  } else {
    const { error: insertError } = await adminClient.from('user').insert({
      ...profilePayload,
      created_at: now,
    });

    if (insertError) {
      throw new HttpError(500, insertError.message);
    }
  }

  return {
    id: authUser.id,
    email,
    name: profilePayload.name,
    role,
    emailVerified: profilePayload.email_verified,
    image: profilePayload.image,
  };
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
