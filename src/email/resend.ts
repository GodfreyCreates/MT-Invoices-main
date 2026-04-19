import { Resend } from 'resend';
import { getResendApiKey, getResendFromEmail, getResendReplyTo } from './config';

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(getResendApiKey());
  }

  return resendClient;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const resend = getResendClient();
  const replyTo = getResendReplyTo();
  const { data, error } = await resend.emails.send({
    from: getResendFromEmail(),
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(error.message || 'Failed to send email');
  }

  return data;
}
