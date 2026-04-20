import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
};

type ConfirmationRequest = ConfirmationOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmationContextValue = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        request.resolve(false);
        resolverRef.current = null;
        setRequest(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [request]);

  const confirm = useMemo<ConfirmationContextValue>(
    () => (options) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setRequest({
          ...options,
          resolve,
        });
      }),
    [],
  );

  const close = (confirmed: boolean) => {
    if (!request) {
      return;
    }

    request.resolve(confirmed);
    resolverRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close confirmation dialog"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => close(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
                  {request.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {request.description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => close(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={request.variant === 'destructive' ? 'destructive' : 'default'}
                onClick={() => close(true)}
              >
                {request.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }

  return context;
}
