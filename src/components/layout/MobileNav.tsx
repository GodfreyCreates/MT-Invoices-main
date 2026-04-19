import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, PlusCircle, Settings, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { authClient } from '../../lib/auth-client';
import { useWorkspace } from '../../lib/workspace';

export function MobileNav() {
  const { data: session } = authClient.useSession();
  const workspace = useWorkspace();
  const location = useLocation();

  if (
    !session ||
    workspace.companies.length === 0 ||
    location.pathname.startsWith('/company/setup') ||
    location.pathname.startsWith('/print')
  ) {
    return null;
  }

  const trailingItems =
    session.user.role === 'admin'
      ? [
          {
            to: '/users',
            label: 'Users',
            icon: Users,
            isActive: location.pathname.startsWith('/users'),
          },
          {
            to: '/settings',
            label: 'Settings',
            icon: Settings,
            isActive: location.pathname.startsWith('/settings'),
          },
        ]
      : [
          null,
          {
            to: '/settings',
            label: 'Settings',
            icon: Settings,
            isActive: location.pathname.startsWith('/settings'),
          },
        ];

  const renderNavItem = (item: (typeof trailingItems)[number] | {
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    isActive: boolean;
  }) => {
    if (!item) {
      return <div aria-hidden="true" className="h-16 w-full" />;
    }

    const Icon = item.icon;

    return (
      <NavLink
        to={item.to}
        className={() =>
          cn(
            'flex flex-col items-center gap-1 px-1 py-2 transition-colors duration-200 min-w-0',
            item.isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-900'
          )
        }
      >
        <Icon className="h-6 w-6 flex-shrink-0" />
        <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden pointer-events-none">
      <div 
        className="pointer-events-auto bg-white/90 backdrop-blur-xl border-t border-gray-200/80 shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.1)] px-6 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        <nav className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-1 pb-1">
          {renderNavItem({
            to: '/',
            label: 'Home',
            icon: LayoutDashboard,
            isActive: location.pathname === '/',
          })}
          {renderNavItem({
            to: '/invoices',
            label: 'Invoices',
            icon: List,
            isActive:
              location.pathname.startsWith('/invoices') && location.pathname !== '/invoices/new',
          })}

          <div className="flex flex-col items-center justify-center px-1 relative -top-6">
            <NavLink
              to="/invoices/new"
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 text-white',
                  isActive ? 'bg-indigo-700 shadow-indigo-500/40 ring-4 ring-indigo-50' : 'bg-gradient-to-tr from-indigo-600 to-blue-600 shadow-blue-500/40 ring-4 ring-white'
                )
              }
            >
              <PlusCircle className="w-7 h-7" strokeWidth={2.5} />
            </NavLink>
          </div>

          {trailingItems.map((item, index) => (
            <React.Fragment key={item?.to ?? `mobile-nav-spacer-${index}`}>
              {renderNavItem(item)}
            </React.Fragment>
          ))}
        </nav>
      </div>
    </div>
  );
}
