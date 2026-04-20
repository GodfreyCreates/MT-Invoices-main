const POST_AUTH_REDIRECT_KEY = 'mt-legacy-post-auth-redirect';

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function savePostAuthRedirectTarget(path: string) {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, path);
}

export function readPostAuthRedirectTarget() {
  if (!canUseSessionStorage()) {
    return null;
  }

  return window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
}

export function clearPostAuthRedirectTarget() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
}
