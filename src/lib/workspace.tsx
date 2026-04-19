import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CompaniesResponse } from './company';
import { apiRequest } from './api';
import { authClient } from './auth-client';

type WorkspaceContextValue = CompaniesResponse & {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  refreshWorkspace: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
};

const defaultWorkspaceState: CompaniesResponse = {
  companies: [],
  activeCompany: null,
  isGlobalAdmin: false,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [workspace, setWorkspace] = useState<CompaniesResponse>(defaultWorkspaceState);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const loadedSessionKeyRef = useRef<string | null>(null);
  const sessionUserId = session?.user.id ?? null;
  const sessionUserRole = session?.user.role ?? null;
  const sessionKey = sessionUserId ?? '__anonymous__';

  const refreshWorkspace = useCallback(async () => {
    if (!sessionUserId) {
      if (isMountedRef.current) {
        setWorkspace(defaultWorkspaceState);
        setError(null);
        setIsLoading(false);
        setIsReady(true);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiRequest<CompaniesResponse>('/api/companies');
      if (!isMountedRef.current) {
        return;
      }

      setWorkspace(data);
    } catch (requestError) {
      if (!isMountedRef.current) {
        return;
      }

      setError(requestError instanceof Error ? requestError.message : 'Failed to load workspace');
      setWorkspace((currentWorkspace) => {
        if (
          currentWorkspace.companies.length > 0 ||
          currentWorkspace.activeCompany ||
          (currentWorkspace.allCompanies?.length ?? 0) > 0
        ) {
          return currentWorkspace;
        }

        return {
          ...defaultWorkspaceState,
          isGlobalAdmin: sessionUserRole === 'admin',
        };
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsReady(true);
      }
    }
  }, [sessionUserId, sessionUserRole]);

  const switchCompany = useCallback(async (companyId: string) => {
    const nextWorkspace = await apiRequest<CompaniesResponse>('/api/companies/active', {
      method: 'POST',
      body: JSON.stringify({ companyId }),
    });

    if (!isMountedRef.current) {
      return;
    }

    setWorkspace(nextWorkspace);
    setError(null);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    loadedSessionKeyRef.current = null;
    setWorkspace(defaultWorkspaceState);
    setError(null);
    setIsLoading(false);
    setIsReady(sessionUserId === null);
  }, [sessionKey, sessionUserId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isSessionPending) {
      return () => {
        isMountedRef.current = false;
      };
    }

    if (loadedSessionKeyRef.current === sessionKey) {
      return () => {
        isMountedRef.current = false;
      };
    }

    loadedSessionKeyRef.current = sessionKey;
    void refreshWorkspace();

    return () => {
      isMountedRef.current = false;
    };
  }, [isSessionPending, refreshWorkspace, sessionKey]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...workspace,
      isLoading,
      isReady,
      error,
      refreshWorkspace,
      switchCompany,
    }),
    [error, isLoading, isReady, refreshWorkspace, switchCompany, workspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }

  return context;
}
