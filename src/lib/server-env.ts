import * as dotenv from 'dotenv';

dotenv.config();

function getEnvValue(name: string) {
  return process.env[name]?.trim();
}

function normalizeOrigin(value: string, envName: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${envName} must be a valid absolute URL`);
  }
}

function normalizeHostedOrigin(value: string, envName: string) {
  return normalizeOrigin(/^https?:\/\//i.test(value) ? value : `https://${value}`, envName);
}

function getVercelOrigins() {
  const origins = new Set<string>();
  const vercelHostVariables = [
    'VERCEL_PROJECT_PRODUCTION_URL',
    'VERCEL_BRANCH_URL',
    'VERCEL_URL',
  ] as const;

  for (const envName of vercelHostVariables) {
    const value = getEnvValue(envName);
    if (!value) {
      continue;
    }

    origins.add(normalizeHostedOrigin(value, envName));
  }

  return Array.from(origins);
}

function getConfiguredAppUrl() {
  return getEnvValue('APP_URL') ?? getEnvValue('SITE_URL') ?? getVercelOrigins()[0];
}

export function getRequiredEnv(name: string) {
  const value = getEnvValue(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getDatabaseUrl() {
  return getRequiredEnv('DATABASE_URL');
}

export function getAuthSecret() {
  return getRequiredEnv('BETTER_AUTH_SECRET');
}

export function getBaseUrl() {
  const configuredAppUrl = getConfiguredAppUrl();
  if (configuredAppUrl) {
    return normalizeOrigin(
      configuredAppUrl,
      getEnvValue('APP_URL') ? 'APP_URL' : 'SITE_URL',
    );
  }

  const port = getEnvValue('PORT') ?? '3000';
  return `http://localhost:${port}`;
}

export function getTrustedOrigins() {
  const origins = new Set<string>([getBaseUrl()]);
  const extraOrigins = getEnvValue('TRUSTED_ORIGINS');

  for (const origin of getVercelOrigins()) {
    origins.add(origin);
  }

  if (extraOrigins) {
    for (const rawOrigin of extraOrigins.split(',')) {
      const trimmedOrigin = rawOrigin.trim();
      if (!trimmedOrigin) {
        continue;
      }
      origins.add(normalizeOrigin(trimmedOrigin, 'TRUSTED_ORIGINS'));
    }
  }

  return Array.from(origins);
}
