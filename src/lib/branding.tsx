import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const DEFAULT_SITE_LOGO = '/logo.png';

type BrandingContextValue = {
  logoUrl: string | null;
  resolvedLogoSrc: string;
  refreshBranding: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

function setHeadLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.appendChild(element);
  }

  element.href = href;
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const isMountedRef = useRef(true);

  const refreshBranding = useCallback(async () => {
    try {
      const response = await fetch('/api/branding', {
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch branding');
      }

      const data = (await response.json()) as { logoUrl?: string | null };
      if (!isMountedRef.current) {
        return;
      }

      setLogoUrl(data.logoUrl ?? null);
      setVersion((current) => current + 1);
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      setLogoUrl(null);
      setVersion((current) => current + 1);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refreshBranding();

    return () => {
      isMountedRef.current = false;
    };
  }, [refreshBranding]);

  const resolvedLogoSrc = useMemo(() => logoUrl ?? DEFAULT_SITE_LOGO, [logoUrl]);
  const faviconSrc = useMemo(() => {
    const separator = resolvedLogoSrc.includes('?') ? '&' : '?';
    return `${resolvedLogoSrc}${separator}v=${version}`;
  }, [resolvedLogoSrc, version]);

  useEffect(() => {
    setHeadLink('icon', faviconSrc);
    setHeadLink('shortcut icon', faviconSrc);
    setHeadLink('apple-touch-icon', faviconSrc);
  }, [faviconSrc]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      logoUrl,
      resolvedLogoSrc,
      refreshBranding,
    }),
    [logoUrl, refreshBranding, resolvedLogoSrc],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }

  return context;
}
