import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  HttpError,
  createAdminClient,
  requireAuthUser,
  syncAppUser,
} from '../_shared/auth.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const INVITATION_EXPIRY_DAYS = 7;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InvitationAction = 'create' | 'get' | 'accept';

type InvitationCreatePayload = {
  action: 'create';
  email: string;
  role?: 'admin' | 'user';
  companyId?: string | null;
  appOrigin?: string;
};

type InvitationGetPayload = {
  action: 'get';
  token: string;
};

type InvitationAcceptPayload = {
  action: 'accept';
  token: string;
  name: string;
  password: string;
};

type InvitationPayload = InvitationCreatePayload | InvitationGetPayload | InvitationAcceptPayload;

function getInvitationRole(value: unknown) {
  return value === 'admin' ? 'admin' : 'user';
}

function getEmail(value: unknown) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Email is required');
  }

  const normalizedEmail = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new HttpError(400, 'Email must be a valid email address');
  }

  return normalizedEmail;
}

function getToken(value: unknown) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new HttpError(400, 'Invitation token must be a valid UUID');
  }

  return value.trim();
}

function getTrimmedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${field} is required`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmed;
}

function getInvitationLink(appOrigin: string, token: string) {
  const baseUrl = new URL(appOrigin);
  return new URL(`/invite/${token}`, baseUrl).toString();
}

async function sendInvitationEmail(
  email: string,
  inviterName: string,
  invitationUrl: string,
) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!resendApiKey) {
    return { delivered: false };
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'MT Legacy <auth@mtlegacylogistics.co.za>';
  const replyTo = Deno.env.get('RESEND_REPLY_TO')?.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'You have been invited to MT Legacy',
      text: [
        `Hello ${email},`,
        '',
        `${inviterName} invited you to join MT Legacy.`,
        'Use the invitation link below to finish setting up your account:',
        invitationUrl,
        '',
        'If you were not expecting this invitation, you can ignore this email.',
      ].join('\n'),
      html: `
        <div>
          <p>Hello ${email},</p>
          <p><strong>${inviterName}</strong> invited you to join MT Legacy.</p>
          <p><a href="${invitationUrl}">Accept invitation</a></p>
          <p>If the button does not open, use this link:</p>
          <p>${invitationUrl}</p>
        </div>
      `,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new HttpError(502, `Failed to send invitation email: ${payload}`);
  }

  return { delivered: true };
}

async function getOpenInvitation(adminClient: ReturnType<typeof createAdminClient>, token: string) {
  const { data, error } = await adminClient
    .from('user_invitations')
    .select('id, email, role, token, company_id, accepted_at, revoked_at, expires_at, company:companies(id, name)')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Invitation not found');
  }

  if (data.accepted_at) {
    throw new HttpError(409, 'This invitation has already been used');
  }

  if (data.revoked_at) {
    throw new HttpError(410, 'This invitation is no longer active');
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new HttpError(410, 'This invitation has expired');
  }

  return data;
}

function getOptionalCompanyId(value: unknown) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new HttpError(400, 'companyId must be a valid UUID');
  }

  return value.trim();
}

async function requireInvitedCompanyId(
  adminClient: ReturnType<typeof createAdminClient>,
  companyId: string | null,
) {
  if (!companyId) {
    throw new HttpError(400, 'Select the company this invited user should join');
  }

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) {
    throw new HttpError(500, companyError.message);
  }

  if (!company) {
    throw new HttpError(400, 'The selected company is no longer available');
  }

  return companyId;
}

async function handleCreateInvitation(payload: InvitationCreatePayload, req: Request) {
  const { user } = await requireAuthUser(req);
  const profile = await syncAppUser(user);
  if (profile.role !== 'admin') {
    throw new HttpError(403, 'Only admins can send invitations');
  }

  const email = getEmail(payload.email);
  const role = getInvitationRole(payload.role);
  const requestedCompanyId = getOptionalCompanyId(payload.companyId);
  const appOrigin = getTrimmedString(payload.appOrigin, 'appOrigin', 200);
  const adminClient = createAdminClient();
  const companyId =
    role === 'user'
      ? await requireInvitedCompanyId(adminClient, requestedCompanyId)
      : null;

  const { data: existingUser, error: existingUserError } = await adminClient
    .from('user')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUserError) {
    throw new HttpError(500, existingUserError.message);
  }

  if (existingUser) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: revokeError } = await adminClient
    .from('user_invitations')
    .update({
      revoked_at: nowIso,
      updated_at: nowIso,
    })
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);

  if (revokeError) {
    throw new HttpError(500, revokeError.message);
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from('user_invitations')
    .insert({
      email,
      role,
      company_id: companyId,
      inviter_user_id: profile.id,
      expires_at: expiresAt,
    })
    .select('email, role, token, expires_at')
    .single();

  if (invitationError || !invitation) {
    throw new HttpError(500, invitationError?.message ?? 'Failed to create invitation');
  }

  const invitationUrl = getInvitationLink(appOrigin, invitation.token);
  const emailStatus = await sendInvitationEmail(email, profile.name, invitationUrl);

  return new Response(
    JSON.stringify({
      email,
      role,
      companyId,
      invitationUrl,
      expiresAt: invitation.expires_at,
      emailDelivered: emailStatus.delivered,
    }),
    {
      status: 201,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
}

async function handleGetInvitation(payload: InvitationGetPayload) {
  const token = getToken(payload.token);
  const adminClient = createAdminClient();
  const invitation = await getOpenInvitation(adminClient, token);

  return new Response(
    JSON.stringify({
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      companyId: invitation.company_id,
      companyName:
        invitation.company && !Array.isArray(invitation.company)
          ? invitation.company.name
          : null,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
}

async function handleAcceptInvitation(payload: InvitationAcceptPayload) {
  const token = getToken(payload.token);
  const name = getTrimmedString(payload.name, 'name', 120);
  const password = getTrimmedString(payload.password, 'password', 128);

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }

  const adminClient = createAdminClient();
  const invitation = await getOpenInvitation(adminClient, token);
  const assignedCompanyId =
    typeof invitation.company_id === 'string' && invitation.company_id.trim()
      ? invitation.company_id.trim()
      : null;

  if (getInvitationRole(invitation.role) === 'user' && !assignedCompanyId) {
    throw new HttpError(409, 'This invitation is missing its company assignment');
  }

  if (assignedCompanyId) {
    const { data: assignedCompany, error: assignedCompanyError } = await adminClient
      .from('companies')
      .select('id')
      .eq('id', assignedCompanyId)
      .maybeSingle();

    if (assignedCompanyError) {
      throw new HttpError(500, assignedCompanyError.message);
    }

    if (!assignedCompany) {
      throw new HttpError(409, 'The company linked to this invitation no longer exists');
    }
  }

  const { data: existingUser, error: existingUserError } = await adminClient
    .from('user')
    .select('id')
    .eq('email', invitation.email)
    .maybeSingle();

  if (existingUserError) {
    throw new HttpError(500, existingUserError.message);
  }

  if (existingUser) {
    throw new HttpError(409, 'An account for this email already exists');
  }

  const role = getInvitationRole(invitation.role);
  const { data, error } = await adminClient.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
    },
    app_metadata: {
      role,
    },
  });

  if (error || !data.user) {
    throw new HttpError(400, error?.message ?? 'Failed to create the Supabase account');
  }

  const now = new Date().toISOString();
  const { error: insertProfileError } = await adminClient.from('user').insert({
    id: data.user.id,
    email: invitation.email,
    name,
    role,
    active_company_id: assignedCompanyId,
    email_verified: true,
    image: null,
    created_at: now,
    updated_at: now,
    last_seen_at: now,
  });

  if (insertProfileError) {
    throw new HttpError(500, insertProfileError.message);
  }

  if (assignedCompanyId) {
    const { error: membershipInsertError } = await adminClient.from('company_memberships').insert({
      company_id: assignedCompanyId,
      user_id: data.user.id,
      role: 'member',
      created_at: now,
      updated_at: now,
    });

    if (membershipInsertError) {
      throw new HttpError(500, membershipInsertError.message);
    }
  }

  const { error: acceptError } = await adminClient
    .from('user_invitations')
    .update({
      accepted_at: now,
      updated_at: now,
    })
    .eq('id', invitation.id);

  if (acceptError) {
    throw new HttpError(500, acceptError.message);
  }

  return new Response(
    JSON.stringify({
      email: invitation.email,
      requiresEmailVerification: false,
    }),
    {
      status: 201,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed');
    }

    const payload = (await req.json()) as InvitationPayload;
    if (!payload || typeof payload !== 'object' || !('action' in payload)) {
      throw new HttpError(400, 'Invitation action is required');
    }

    switch (payload.action as InvitationAction) {
      case 'create':
        return await handleCreateInvitation(payload as InvitationCreatePayload, req);
      case 'get':
        return await handleGetInvitation(payload as InvitationGetPayload);
      case 'accept':
        return await handleAcceptInvitation(payload as InvitationAcceptPayload);
      default:
        throw new HttpError(400, 'Unsupported invitation action');
    }
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

    console.error('auth-invitations failure', error);
    return new Response(JSON.stringify({ error: 'Invitation request failed' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
