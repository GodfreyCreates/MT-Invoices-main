import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

type HeaderProps = {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  user?: HeaderUser | null;
  onSignOut?: () => void | Promise<void>;
  showPrimaryLinks?: boolean;
  canAccessCompanies?: boolean;
};

type HeaderBrandProps = {
  title: string;
  subtitle?: React.ReactNode;
  className?: string;
  logoSrc?: string;
  logoAlt?: string;
};

type HeaderTitleProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
};

type HeaderMenuLink = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  matches: (pathname: string) => boolean;
};

function getUserInitials(user?: HeaderUser | null) {
  const source = user?.name?.trim() || user?.email?.trim() || 'MT';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function Header({
  left,
  right,
  className,
  contentClassName,
  user,
  onSignOut,
  showPrimaryLinks = true,
  canAccessCompanies = false,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const initials = useMemo(() => getUserInitials(user), [user]);
  const displayName = user?.name?.trim() || 'User';
  const displayEmail = user?.email?.trim() || 'No email available';
  const displayRole = user?.role?.trim();
  const isAdmin = displayRole?.toLowerCase() === 'admin';
  const menuLinks = useMemo<HeaderMenuLink[]>(
    () => [
      {
        href: '/dashboard',
        icon: LayoutDashboard,
        label: 'Dashboard',
        matches: (pathname) => pathname === '/' || pathname === '/dashboard',
      },
      {
        href: '/invoices',
        icon: FileText,
        label: 'Invoices',
        matches: (pathname) => pathname.startsWith('/invoices') || pathname.startsWith('/invoice/'),
      },
      {
        href: '/companies',
        icon: Building2,
        label: 'Companies',
        matches: (pathname) => pathname.startsWith('/companies') || pathname.startsWith('/company/'),
      },
      {
        href: '/settings',
        icon: Settings,
        label: 'Settings',
        matches: (pathname) => pathname.startsWith('/settings'),
      },
      ...(isAdmin
        ? [
            {
              href: '/users',
              icon: Users,
              label: 'Users',
              matches: (pathname: string) => pathname.startsWith('/users'),
            },
          ]
        : []),
    ],
    [canAccessCompanies, isAdmin],
  );
  const visibleMenuLinks = menuLinks.filter(
    (link) => canAccessCompanies || (link.href !== '/companies' && !link.href.startsWith('/company')),
  );
  const desktopPrimaryLinks = menuLinks.filter(
    (link) => link.href === '/dashboard' || link.href === '/invoices',
  );
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    await onSignOut?.();
  };

  const handleNavigate = (href: string) => {
    setIsMenuOpen(false);
    navigate(href);
  };

  return (
    <header 
      className={cn(
        'sticky inset-x-0 top-0 z-[60] w-full shrink-0 border-b border-gray-200/80 bg-white/95 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-all duration-300 supports-[backdrop-filter]:bg-white/80',
        className
      )}
    >
      <div
        className={cn(
          'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4 transition-all duration-300',
          contentClassName,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">{left}</div>
        {(right || user) && (
          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3 lg:gap-4">
            {showPrimaryLinks
              ? desktopPrimaryLinks.map((link) => (
                  <Button
                    key={link.href}
                    variant={link.matches(location.pathname) ? 'default' : 'outline'}
                    onClick={() => handleNavigate(link.href)}
                    className="hidden gap-2 md:flex"
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Button>
                ))
              : null}
            {right}
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  className="group flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-2 py-1.5 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={displayName}
                      className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-900 via-indigo-700 to-blue-600 text-sm font-bold text-white shadow-sm">
                      {initials}
                    </div>
                  )}
                  <ChevronDown
                    className={cn(
                      'hidden h-4 w-4 text-slate-500 transition-transform duration-200 sm:block',
                      isMenuOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]"
                  >
                    <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4 py-4">
                      <div className="flex items-start gap-3">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt={displayName}
                            className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-900 via-indigo-700 to-blue-600 text-base font-bold text-white shadow-sm">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{displayEmail}</p>
                          {displayRole ? (
                            <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-700">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {displayRole}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="hidden border-b border-slate-200 p-2 sm:block">
                      {visibleMenuLinks.map((link) => {
                        const isActive = link.matches(location.pathname);

                        return (
                          <button
                            key={link.href}
                            type="button"
                            role="menuitem"
                            onClick={() => handleNavigate(link.href)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                              isActive
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                            )}
                          >
                            <link.icon className="h-4 w-4" />
                            {link.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <LogOut className="h-4 w-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  );
}

export function HeaderBrand({
  title,
  subtitle,
  className,
  logoSrc,
  logoAlt,
}: HeaderBrandProps) {
  return (
    <div className={cn('group flex min-w-0 items-center gap-3 md:gap-3.5', className)}>
      <div
        className={cn(
          'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white font-bold shadow-md ring-1 transition-all duration-300 ease-out group-hover:shadow-lg group-hover:scale-105 group-hover:-rotate-2 sm:h-11 sm:w-11',
          logoSrc
            ? 'bg-white ring-slate-200'
            : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 ring-white/10',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 translate-y-full transition-transform duration-500 ease-out group-hover:translate-y-0',
            logoSrc ? 'bg-slate-900/5' : 'bg-white/20',
          )}
        />
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={logoAlt ?? `${title} logo`}
            className="relative z-10 h-full w-full object-contain p-1"
          />
        ) : (
          <span className="relative z-10 text-sm md:text-base tracking-wider drop-shadow-sm">MT</span>
        )}
      </div>
      <HeaderTitle title={title} subtitle={subtitle} />
    </div>
  );
}

export function HeaderTitle({ title, subtitle, className }: HeaderTitleProps) {
  return (
    <div className={cn('flex flex-col min-w-0 justify-center translate-y-[1px]', className)}>
      <span className="truncate text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-none group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-700 group-hover:to-indigo-700 transition-all duration-300">
        {title}
      </span>
      {subtitle && (
        <span className="mt-1 sm:mt-1.5 truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-indigo-600/90 transition-colors duration-300 group-hover:text-indigo-500">
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function HeaderDivider({ className }: { className?: string }) {
  return (
    <div 
      className={cn(
        'mx-2 sm:mx-3 h-8 w-[1px] bg-gradient-to-b from-transparent via-gray-300 to-transparent opacity-80 transition-opacity', 
        className
      )} 
      aria-hidden="true" 
    />
  );
}
