type VerificationEmailTemplateInput = {
  recipientName: string;
  verificationUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createVerificationEmailTemplate({
  recipientName,
  verificationUrl,
}: VerificationEmailTemplateInput) {
  const safeName = escapeHtml(recipientName);
  const safeUrl = escapeHtml(verificationUrl);
  const subject = 'Verify your MT Legacy account';

  return {
    subject,
    text: [
      `Hello ${recipientName},`,
      '',
      'Welcome to MT Legacy.',
      'Verify your email address to finish setting up your account:',
      verificationUrl,
      '',
      'If you did not create this account, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
          <div style="padding:28px 32px;background:linear-gradient(135deg,#312e81 0%,#4338ca 55%,#7c3aed 100%);color:#ffffff;">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#ffffff;color:#312e81;font-size:18px;font-weight:700;letter-spacing:0.08em;">
              MT
            </div>
            <h1 style="margin:20px 0 8px;font-size:28px;line-height:1.15;font-weight:700;">Confirm your email</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.82);">
              Finish activating your MT Legacy account securely.
            </p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hello ${safeName},</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#334155;">
              Thanks for signing up. Verify your email address to unlock sign-in and secure your account.
            </p>
            <a
              href="${safeUrl}"
              style="display:inline-block;padding:14px 22px;border-radius:14px;background:#312e81;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;"
            >
              Verify email address
            </a>
            <p style="margin:24px 0 12px;font-size:13px;line-height:1.7;color:#64748b;">
              If the button does not open, copy and paste this link into your browser:
            </p>
            <p style="margin:0;padding:14px 16px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;word-break:break-all;font-size:13px;line-height:1.7;color:#1e293b;">
              ${safeUrl}
            </p>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
              If you did not create this account, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
