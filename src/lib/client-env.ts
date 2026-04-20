export function getClientApiOrigin() {
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
