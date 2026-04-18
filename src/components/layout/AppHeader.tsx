import React from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authClient } from '../../lib/auth-client';
import { useBranding } from '../../lib/branding';
import { Button } from '../ui/Button';
import { Header, HeaderBrand } from './Header';

function getWorkspaceSubtitle(role?: string | null) {
  return role?.toLowerCase() === 'admin' ? 'Super Admin' : 'Invoice Workspace';
}

type AppHeaderProps = {
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  showCreateInvoice?: boolean;
};

export function AppHeader({
  action,
  className,
  contentClassName,
  showCreateInvoice = true,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { resolvedLogoSrc } = useBranding();

  const handleSignOut = async () => {
    await authClient.signOut();
    toast.success('Signed out successfully');
    navigate('/auth');
  };

  return (
    <Header
      className={className}
      contentClassName={contentClassName}
      left={
        <HeaderBrand
          title="MT Legacy"
          subtitle={getWorkspaceSubtitle(session?.user?.role)}
          logoSrc={resolvedLogoSrc}
          logoAlt="MT Legacy logo"
        />
      }
      user={session?.user}
      onSignOut={handleSignOut}
      right={
        <>
          {action}
          {showCreateInvoice ? (
            <Button onClick={() => navigate('/invoices/new')} className="hidden gap-2 sm:flex">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          ) : null}
        </>
      }
    />
  );
}
