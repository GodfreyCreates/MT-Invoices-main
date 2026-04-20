import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toClientApiUrl } from './client-env';

const DEFAULT_SITE_LOGO = '/logo.png';

type BrandingContextValue = {
  siteLogoUrl: string | null;
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
  const [siteLogoUrl, setSiteLogoUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const isMountedRef = useRef(true);

  const refreshBranding = useCallback(async () => {
    try {
      const response = await fetch(toClientApiUrl('/api/branding'), {
        cache: 'no-store',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch branding');
      }

      const data = (await response.json()) as { siteLogoUrl?: string | null };
      if (!isMountedRef.current) {
        return;
      }

      setSiteLogoUrl(data.siteLogoUrl ?? null);
      setVersion((current) => current + 1);
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      setSiteLogoUrl(null);
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

  const resolvedLogoSrc = useMemo(() => siteLogoUrl ?? DEFAULT_SITE_LOGO, [siteLogoUrl]);
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
      siteLogoUrl,
      resolvedLogoSrc,
      refreshBranding,
    }),
    [refreshBranding, resolvedLogoSrc, siteLogoUrl],
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
