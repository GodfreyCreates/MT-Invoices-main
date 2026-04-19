type InvitationEmailTemplateInput = {
  inviteeEmail: string;
  invitationUrl: string;
  inviterName: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createInvitationEmailTemplate({
  inviteeEmail,
  invitationUrl,
  inviterName,
}: InvitationEmailTemplateInput) {
  const safeEmail = escapeHtml(inviteeEmail);
  const safeUrl = escapeHtml(invitationUrl);
  const safeInviterName = escapeHtml(inviterName);
  const subject = 'You have been invited to MT Legacy';

  return {
    subject,
    text: [
      `Hello ${inviteeEmail},`,
      '',
      `${inviterName} invited you to join MT Legacy.`,
      'Use the invitation link below to finish setting up your account:',
      invitationUrl,
      '',
      'If you were not expecting this invitation, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
          <div style="padding:28px 32px;background:linear-gradient(135deg,#312e81 0%,#4338ca 55%,#7c3aed 100%);color:#ffffff;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#ffffff;color:#312e81;font-size:18px;font-weight:700;letter-spacing:0.08em;">
              MT
            </div>
            <h1 style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:700;">You&apos;re invited</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.82);">
              Complete your MT Legacy account setup using the invitation below.
            </p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hello ${safeEmail},</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#334155;">
              <strong style="color:#0f172a;">${safeInviterName}</strong> invited you to access MT Legacy. Use the secure link below to create your password and activate your account.
            </p>
            <a
              href="${safeUrl}"
              style="display:inline-block;padding:14px 22px;border-radius:14px;background:#312e81;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;"
            >
              Accept invitation
            </a>
            <p style="margin:24px 0 12px;font-size:13px;line-height:1.7;color:#64748b;">
              If the button does not open, copy and paste this link into your browser:
            </p>
            <p style="margin:0;padding:14px 16px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;word-break:break-all;font-size:13px;line-height:1.7;color:#1e293b;">
              ${safeUrl}
            </p>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
              If you were not expecting this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
