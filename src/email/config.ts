import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_FROM_EMAIL = 'MT Legacy <auth@mtlegacylogistics.co.za>';

function getEnvValue(name: string) {
  return process.env[name]?.trim();
}

export function getResendApiKey() {
  const value = getEnvValue('RESEND_API_KEY');
  if (!value) {
    throw new Error('Missing required environment variable: RESEND_API_KEY');
  }

  return value;
}

export function getResendFromEmail() {
  return getEnvValue('RESEND_FROM_EMAIL') ?? DEFAULT_FROM_EMAIL;
}

export function getResendReplyTo() {
  return getEnvValue('RESEND_REPLY_TO') ?? undefined;
}
