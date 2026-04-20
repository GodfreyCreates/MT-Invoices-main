import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_LOCAL_PORT = '3000';
const DEFAULT_LOCAL_DEV_HOSTS = ['localhost:5173', '127.0.0.1:5173'] as const;

let hasWarnedAboutSiteUrl = false;

function getEnvValue(name: string) {
  return process.env[name]?.trim();
}

function isHostedEnvironment() {
  return Boolean(getEnvValue('VERCEL')) || getEnvValue('NODE_ENV') === 'production';
}

function normalizeOrigin(value: string, envName: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${envName} must be a valid absolute URL`);
  }
}

function normalizeHostPattern(value: string, envName: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${envName} must not contain empty host values`);
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    try {
      return new URL(trimmedValue).host;
    } catch {
      throw new Error(`${envName} must contain valid hostnames or absolute URLs`);
    }
  }

  if (trimmedValue.includes('/')) {
    throw new Error(`${envName} must contain hostnames or host patterns without a path`);
  }

  return trimmedValue;
}

function getVercelRequestHosts() {
  const hosts = new Set<string>();
  const vercelHostVariables = ['VERCEL_BRANCH_URL', 'VERCEL_URL'] as const;

  for (const envName of vercelHostVariables) {
    const value = getEnvValue(envName);
    if (!value) {
      continue;
    }

    hosts.add(normalizeHostPattern(value, envName));
  }

  return Array.from(hosts);
}

function getDeprecatedSiteUrlOrigin() {
  const siteUrl = getEnvValue('SITE_URL');
  if (!siteUrl) {
    return null;
  }

  const origin = normalizeOrigin(siteUrl, 'SITE_URL');
  if (!hasWarnedAboutSiteUrl) {
    hasWarnedAboutSiteUrl = true;
    console.warn('SITE_URL is deprecated. Set APP_URL instead.');
  }

  return origin;
}

function getConfiguredPublicAppOrigin() {
  const appUrl = getEnvValue('APP_URL');
  if (appUrl) {
    return normalizeOrigin(appUrl, 'APP_URL');
  }

  return getDeprecatedSiteUrlOrigin();
}

function getDefaultLocalOrigin() {
  const port = getEnvValue('PORT') ?? DEFAULT_LOCAL_PORT;
  return `http://localhost:${port}`;
}

function getLocalDevelopmentHosts() {
  const port = getEnvValue('PORT') ?? DEFAULT_LOCAL_PORT;
  return [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    ...DEFAULT_LOCAL_DEV_HOSTS,
  ];
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

export function getPublicAppOrigin() {
  const configuredPublicAppOrigin = getConfiguredPublicAppOrigin();
  if (configuredPublicAppOrigin) {
    return configuredPublicAppOrigin;
  }

  if (isHostedEnvironment()) {
    throw new Error('Missing required environment variable: APP_URL');
  }

  return getDefaultLocalOrigin();
}

export function getAuthAllowedHosts() {
  const hosts = new Set<string>([
    ...getLocalDevelopmentHosts(),
    ...getVercelRequestHosts(),
  ]);
  const publicAppOrigin = getConfiguredPublicAppOrigin();
  const extraHosts = getEnvValue('AUTH_ALLOWED_HOSTS');

  if (publicAppOrigin) {
    hosts.add(new URL(publicAppOrigin).host);
  }

  if (extraHosts) {
    for (const rawHost of extraHosts.split(',')) {
      hosts.add(normalizeHostPattern(rawHost, 'AUTH_ALLOWED_HOSTS'));
    }
  }

  return Array.from(hosts);
}

export function getAuthBaseUrlConfig() {
  return {
    allowedHosts: getAuthAllowedHosts(),
    protocol: 'auto' as const,
  };
}

export function toPublicAppUrl(value: string) {
  const publicOrigin = getPublicAppOrigin();
  const resolvedUrl = new URL(value, publicOrigin);
  const publicUrl = new URL(publicOrigin);

  resolvedUrl.protocol = publicUrl.protocol;
  resolvedUrl.host = publicUrl.host;

  return resolvedUrl.toString();
}

export function getTrustedOrigins() {
  const origins = new Set<string>();
  const extraOrigins = getEnvValue('TRUSTED_ORIGINS');

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
