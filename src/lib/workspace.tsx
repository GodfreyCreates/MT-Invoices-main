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
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const refreshWorkspace = useCallback(async () => {
    if (!session) {
      if (isMountedRef.current) {
        setWorkspace(defaultWorkspaceState);
        setError(null);
        setIsLoading(false);
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
      setWorkspace({
        ...defaultWorkspaceState,
        isGlobalAdmin: session.user.role === 'admin',
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [session]);

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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (isSessionPending) {
      return () => {
        isMountedRef.current = false;
      };
    }

    void refreshWorkspace();

    return () => {
      isMountedRef.current = false;
    };
  }, [isSessionPending, refreshWorkspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...workspace,
      isLoading: isSessionPending || isLoading,
      error,
      refreshWorkspace,
      switchCompany,
    }),
    [error, isLoading, isSessionPending, refreshWorkspace, switchCompany, workspace],
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
