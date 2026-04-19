import { sendEmail } from './resend';
import { createInvitationEmailTemplate } from './templates/invitation-email';
import { createVerificationEmailTemplate } from './templates/verification-email';

type SendAccountVerificationEmailInput = {
  email: string;
  name?: string | null;
  verificationUrl: string;
};

type SendUserInvitationEmailInput = {
  email: string;
  inviterName: string;
  invitationUrl: string;
};

export async function sendAccountVerificationEmail({
  email,
  name,
  verificationUrl,
}: SendAccountVerificationEmailInput) {
  const template = createVerificationEmailTemplate({
    recipientName: name?.trim() || 'there',
    verificationUrl,
  });

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

export async function sendUserInvitationEmail({
  email,
  inviterName,
  invitationUrl,
}: SendUserInvitationEmailInput) {
  const template = createInvitationEmailTemplate({
    inviteeEmail: email,
    inviterName,
    invitationUrl,
  });

  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
