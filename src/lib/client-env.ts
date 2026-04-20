function normalizeClientOrigin(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return null;
  }
}

export function getClientApiOrigin() {
  const configuredOrigin = normalizeClientOrigin(import.meta.env.VITE_API_ORIGIN ?? '');
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.origin;
}

export function toClientApiUrl(path: string) {
  const apiOrigin = getClientApiOrigin();
  if (!apiOrigin) {
    return path;
  }

  return new URL(path, apiOrigin).toString();
}
