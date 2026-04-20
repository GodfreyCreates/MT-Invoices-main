import { useEffect, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { invokeSupabaseFunction } from './supabase-functions';
import { supabase } from './supabase';

type AppSessionUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  emailVerified: boolean;
  image: string | null;
};

type AppSession = {
  user: AppSessionUser;
  session: {
    id: string;
    accessToken: string;
    expiresAt: number | null;
  };
};

type SessionResponse = {
  user: AppSessionUser;
};

function parseJwtPayload(token: string) {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as { session_id?: string };
  } catch {
    return null;
  }
}

type UseSessionResult = {
  data: AppSession | null;
  isPending: boolean;
  refetch: () => Promise<AppSession | null>;
};

type SessionStoreState = {
  data: AppSession | null;
  isPending: boolean;
  initialized: boolean;
};

async function fetchSessionProfile(session: Session): Promise<AppSession | null> {
  const payload = await invokeSupabaseFunction<SessionResponse>('auth-session', {
    accessToken: session.access_token,
  });
  const jwtPayload = parseJwtPayload(session.access_token);
  return {
    user: payload.user,
    session: {
      id:
        typeof jwtPayload?.session_id === 'string' && jwtPayload.session_id.length > 0
          ? jwtPayload.session_id
          : session.access_token,
      accessToken: session.access_token,
      expiresAt: session.expires_at ?? null,
    },
  };
}

const sessionStore = {
  state: {
    data: null,
    isPending: true,
    initialized: false,
  } as SessionStoreState,
  listeners: new Set<() => void>(),
  initializedSubscription: false,
  requestId: 0,
};

function emitSessionStoreChange() {
  sessionStore.listeners.forEach((listener) => listener());
}

function setSessionStoreState(nextState: Partial<SessionStoreState>) {
  sessionStore.state = {
    ...sessionStore.state,
    ...nextState,
  };
  emitSessionStoreChange();
}

function subscribeToSessionStore(listener: () => void) {
  sessionStore.listeners.add(listener);
  return () => {
    sessionStore.listeners.delete(listener);
  };
}

function getSessionStoreSnapshot() {
  return sessionStore.state;
}

async function syncSharedSession(nextSession?: Session | null, forcePending = false) {
  const requestId = ++sessionStore.requestId;
  const shouldShowPending =
    forcePending || (!sessionStore.state.initialized && sessionStore.state.data === null);

  if (shouldShowPending) {
    setSessionStoreState({ isPending: true });
  }

  try {
    const sessionToUse =
      typeof nextSession === 'undefined'
        ? (await supabase.auth.getSession()).data.session
        : nextSession;

    const nextData = sessionToUse ? await fetchSessionProfile(sessionToUse) : null;
    if (requestId !== sessionStore.requestId) {
      return nextData;
    }

    setSessionStoreState({
      data: nextData,
      isPending: false,
      initialized: true,
    });
    return nextData;
  } catch (error) {
    if (requestId === sessionStore.requestId) {
      console.error('Failed to resolve Supabase session', error);
      setSessionStoreState({
        data: null,
        isPending: false,
        initialized: true,
      });
    }
    return null;
  }
}

function ensureSessionSubscription() {
  if (sessionStore.initializedSubscription) {
    return;
  }

  sessionStore.initializedSubscription = true;
  void syncSharedSession(undefined, true);

  supabase.auth.onAuthStateChange((_event, session) => {
    void syncSharedSession(session);
  });
}

export const authClient = {
  async getSession() {
    ensureSessionSubscription();
    return syncSharedSession();
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  },

  useSession(): UseSessionResult {
    useEffect(() => {
      ensureSessionSubscription();
    }, []);

    const snapshot = useSyncExternalStore(subscribeToSessionStore, getSessionStoreSnapshot);

    return {
      data: snapshot.data,
      isPending: snapshot.isPending,
      refetch: async () => syncSharedSession(),
    };
  },
};

type SessionLike = {
  user?: {
    id?: string | null;
  } | null;
} | null | undefined;

export function isAuthenticatedSession(session: SessionLike): session is {
  user: {
    id: string;
  };
} {
  return typeof session?.user?.id === 'string' && session.user.id.length > 0;
}
