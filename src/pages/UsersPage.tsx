import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppHeader } from '../components/layout/AppHeader';
import { Button } from '../components/ui/Button';
import { useConfirmation } from '../components/ui/ConfirmationProvider';
import { PopoverSelect, type PopoverSelectOption } from '../components/ui/PopoverSelect';
import { ApiError, apiRequest } from '../lib/api';
import { authClient, isAuthenticatedSession } from '../lib/auth-client';
import { invokeSupabaseFunctionWithSession } from '../lib/supabase-functions';
import { cn } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

type UserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  invoiceCount: number;
  activeSessions: number;
  lastSeenAt: string | null;
  isCurrentUser: boolean;
};

type RoleFilter = 'all' | 'admin' | 'user';
type VerificationFilter = 'all' | 'verified' | 'unverified';
type InviteRole = 'admin' | 'user';
type InviteUserResponse = {
  email: string;
  role: InviteRole;
  companyId: string | null;
  invitationUrl: string;
  expiresAt: string;
  emailDelivered: boolean;
};

const inviteRoleOptions: PopoverSelectOption<InviteRole>[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const roleFilterOptions: PopoverSelectOption<RoleFilter>[] = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Admins' },
  { value: 'user', label: 'Users' },
];

const verificationFilterOptions: PopoverSelectOption<VerificationFilter>[] = [
  { value: 'all', label: 'All states' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Pending' },
];

const shortDateFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
});

const fullDateFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null, fallback = 'Not available') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : shortDateFormatter.format(parsed);
}

function formatDateTime(value: string | null, fallback = 'Not available') {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : fullDateFormatter.format(parsed);
}

function getInitials(user: UserSummary) {
  const source = user.name.trim() || user.email.trim();
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

function UserAvatar({ user, size = 'md' }: { user: UserSummary; size?: 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16 text-lg' : 'h-12 w-12 text-sm';
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name}
        className={cn(dimensions, 'rounded-2xl object-cover ring-1 ring-slate-200')}
      />
    );
  }

  return (
    <div
      className={cn(
        dimensions,
        'flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-blue-600 font-bold text-white shadow-sm',
      )}
    >
      {getInitials(user)}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] backdrop-blur sm:rounded-3xl sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:mt-3 sm:text-3xl">
            {value}
          </p>
        </div>
        <div className={cn('rounded-2xl p-2.5 sm:p-3', accent)}>{icon}</div>
      </div>
    </div>
  );
}

function UserStatusBadge({ user }: { user: UserSummary }) {
  if (user.banned) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-red-700">
        Restricted
      </span>
    );
  }

  if (user.emailVerified) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
        Verified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-700">
      Pending
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function UsersTable({
  users,
  onOpenDetails,
}: {
  users: UserSummary[];
  onOpenDetails: (user: UserSummary) => void;
}) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200/80 text-slate-500">
          <tr>
            <th className="px-6 py-4 font-medium">User</th>
            <th className="px-6 py-4 font-medium">Role</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Invoices</th>
            <th className="px-6 py-4 font-medium">Last seen</th>
            <th className="px-6 py-4 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {users.map((user) => (
            <tr key={user.id} className="group transition-colors hover:bg-slate-50/70">
              <td className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <UserAvatar user={user} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{user.name}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-700">
                    {user.role ?? 'user'}
                  </span>
                  {user.isCurrentUser ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-700">
                      You
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-6 py-5">
                <UserStatusBadge user={user} />
              </td>
              <td className="px-6 py-5 font-medium text-slate-900">{user.invoiceCount}</td>
              <td className="px-6 py-5 text-slate-500">{formatDateTime(user.lastSeenAt, 'No recent session')}</td>
              <td className="px-6 py-5 text-right">
                <Button
                  variant="ghost"
                  className="gap-2 text-slate-700 hover:text-indigo-700"
                  onClick={() => onOpenDetails(user)}
                >
                  View details
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersCardList({
  users,
  onOpenDetails,
}: {
  users: UserSummary[];
  onOpenDetails: (user: UserSummary) => void;
}) {
  return (
    <div className="grid gap-4 lg:hidden">
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          onClick={() => onOpenDetails(user)}
          className="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 text-left shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_24px_70px_-40px_rgba(79,70,229,0.4)] sm:rounded-3xl sm:p-5"
        >
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <UserAvatar user={user} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{user.name}</p>
                <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-700">
              {user.role ?? 'user'}
            </span>
            <UserStatusBadge user={user} />
          </div>

          <div className="mt-4 grid gap-3 min-[420px]:grid-cols-2">
            <DetailRow label="Invoices" value={user.invoiceCount} />
            <DetailRow label="Active sessions" value={user.activeSessions} />
          </div>
        </button>
      ))}
    </div>
  );
}

function UserDetailsDialog({
  user,
  isDeleting,
  onDelete,
  onClose,
}: {
  user: UserSummary | null;
  isDeleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {user ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.button
            type="button"
            aria-label="Close user details"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 flex max-h-[min(100vh-0.5rem,54rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[32px] border border-white/70 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.45)] sm:max-h-[min(100vh-2rem,54rem)] sm:rounded-[32px]"
          >
            <div className="border-b border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/80 px-4 py-5 sm:px-6 sm:py-6">
              <div className="relative flex items-start gap-4 pr-12 sm:gap-6">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  <UserAvatar user={user} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                        {user.name}
                      </h2>
                      {user.isCurrentUser ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-700">
                          Current account
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span className="inline-flex max-w-full items-start gap-2 break-all">
                        <Mail className="h-4 w-4" />
                        {user.email}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-700">
                        {user.role ?? 'user'}
                      </span>
                      <UserStatusBadge user={user} />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-0 top-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid flex-1 gap-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.35fr,0.95fr]">
              <div className="grid gap-4">
                <DetailRow label="User ID" value={<span className="break-all font-mono text-xs">{user.id}</span>} />
                <DetailRow label="Joined" value={formatDateTime(user.createdAt)} />
                <DetailRow label="Last profile update" value={formatDateTime(user.updatedAt)} />
                <DetailRow label="Last activity" value={formatDateTime(user.lastSeenAt, 'No active sessions recorded')} />
                <DetailRow
                  label="Account health"
                  value={
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Email {user.emailVerified ? 'verified' : 'not verified'}
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-indigo-600" />
                        {user.banned ? 'Account has access restrictions' : 'Account is in good standing'}
                      </div>
                      {user.banReason ? (
                        <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-red-700">
                          Restriction reason: {user.banReason}
                        </p>
                      ) : null}
                    </div>
                  }
                />
              </div>

              <div className="grid gap-4">
                <DetailRow label="Invoices created" value={user.invoiceCount} />
                <DetailRow label="Active sessions" value={user.activeSessions} />
                <DetailRow label="Restriction ends" value={formatDateTime(user.banExpires, 'No restriction expiry set')} />
                <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.45)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
                    Snapshot
                  </p>
                  <div className="mt-4 grid gap-4 min-[480px]:grid-cols-3 lg:grid-cols-1">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight">{user.invoiceCount}</p>
                      <p className="mt-1 text-sm text-white/70">Invoices on record</p>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold tracking-tight">{user.activeSessions}</p>
                      <p className="mt-1 text-sm text-white/70">Live sessions</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{formatDate(user.createdAt)}</p>
                      <p className="mt-1 text-sm text-white/70">Joined the workspace</p>
                    </div>
                  </div>
                </div>
                {!user.isCurrentUser ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? 'Deleting user...' : 'Delete user'}
                  </Button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function InviteUserDialog({
  isOpen,
  email,
  role,
  companyId,
  companyOptions,
  isSubmitting,
  onEmailChange,
  onRoleChange,
  onCompanyChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  email: string;
  role: InviteRole;
  companyId: string;
  companyOptions: PopoverSelectOption<string>[];
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: InviteRole) => void;
  onCompanyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.button
            type="button"
            aria-label="Close invitation dialog"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] border border-white/70 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.45)] sm:rounded-[32px]"
          >
            <div className="border-b border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/80 px-5 py-5 sm:px-6">
              <div className="relative pr-12">
                <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite account
                </p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                  Send an invitation
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The recipient will get an email with a secure invitation link to create their password. Their email stays fixed during setup.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-0 top-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="user@example.com"
                  className="mt-2 block h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <PopoverSelect
                  value={role}
                  onValueChange={onRoleChange}
                  options={inviteRoleOptions}
                  ariaLabel="Invitation role"
                  triggerClassName="mt-2 h-12"
                />
              </div>

              {role === 'user' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company</label>
                  <PopoverSelect
                    value={companyId}
                    onValueChange={onCompanyChange}
                    options={companyOptions}
                    placeholder="Select the company to assign"
                    emptyMessage="No companies available"
                    ariaLabel="Invitation company"
                    triggerClassName="mt-2 h-12"
                  />
                  <p className="mt-2 text-sm text-slate-500">
                    The invited user will join this company as a member after they accept the invitation.
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Invitations expire automatically after 7 days. Sending a new invite for the same email replaces the previous active one.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={onSubmit} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? 'Sending invitation...' : 'Send invitation'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function UsersPage() {
  const navigate = useNavigate();
  const confirm = useConfirmation();
  const workspace = useWorkspace();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isAuthenticated = isAuthenticatedSession(session);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('user');
  const [inviteCompanyId, setInviteCompanyId] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiRequest<UserSummary[]>('/api/users');
      setUsers(data);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 403) {
        setError('Only administrators can view the users directory.');
        return;
      }

      const message =
        requestError instanceof Error ? requestError.message : 'Failed to load users';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSessionPending || !isAuthenticated) {
      return;
    }

    if (session.user.role !== 'admin') {
      setIsLoading(false);
      setError('Only administrators can view the users directory.');
      return;
    }

    loadUsers();
  }, [isAuthenticated, isSessionPending, session]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        user.name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery) ||
        user.role?.toLowerCase().includes(normalizedQuery);

      const normalizedRole = (user.role ?? 'user').toLowerCase();
      const matchesRole = roleFilter === 'all' || normalizedRole === roleFilter;

      const matchesVerification =
        verificationFilter === 'all' ||
        (verificationFilter === 'verified' ? user.emailVerified : !user.emailVerified);

      return matchesQuery && matchesRole && matchesVerification;
    });
  }, [normalizedQuery, roleFilter, users, verificationFilter]);

  const stats = useMemo(() => {
    const adminCount = users.filter((user) => (user.role ?? 'user') === 'admin').length;
    const verifiedCount = users.filter((user) => user.emailVerified).length;
    const activeSessions = users.reduce((total, user) => total + user.activeSessions, 0);

    return {
      totalUsers: users.length,
      adminCount,
      verifiedCount,
      activeSessions,
    };
  }, [users]);

  const inviteCompanyOptions = useMemo<PopoverSelectOption<string>[]>(() => {
    const companies = workspace.allCompanies ?? workspace.companies;
    return companies.map((company) => ({
      value: company.id,
      label: company.name,
      description: `${company.memberCount} member${company.memberCount === 1 ? '' : 's'}`,
    }));
  }, [workspace.allCompanies, workspace.companies]);

  useEffect(() => {
    if (inviteRole !== 'user') {
      setInviteCompanyId('');
      return;
    }

    if (inviteCompanyId) {
      return;
    }

    const defaultCompanyId = workspace.activeCompany?.id ?? inviteCompanyOptions[0]?.value ?? '';
    if (defaultCompanyId) {
      setInviteCompanyId(defaultCompanyId);
    }
  }, [inviteCompanyId, inviteCompanyOptions, inviteRole, workspace.activeCompany?.id]);

  const openUserDetails = (user: UserSummary) => {
    startTransition(() => {
      setSelectedUser(user);
    });
  };

  const handleSendInvitation = async () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Email is required');
      return;
    }

    if (inviteRole === 'user' && !inviteCompanyId) {
      toast.error('Select the company this invited user should join');
      return;
    }

    setIsSendingInvite(true);

    try {
      const result = await invokeSupabaseFunctionWithSession<InviteUserResponse>('auth-invitations', {
        action: 'create',
        email: normalizedEmail,
        role: inviteRole,
        companyId: inviteRole === 'user' ? inviteCompanyId : null,
        appOrigin: window.location.origin,
      });

      if (result.emailDelivered) {
        toast.success(`Invitation sent to ${normalizedEmail}`);
      } else {
        try {
          await navigator.clipboard.writeText(result.invitationUrl);
          toast.warning(`Invitation created for ${normalizedEmail}. Email was not sent, so the invite link was copied to your clipboard.`);
        } catch {
          toast.warning(`Invitation created for ${normalizedEmail}. Email was not sent. Share the invite link manually: ${result.invitationUrl}`);
        }
      }

      setInviteEmail('');
      setInviteRole('user');
      setInviteCompanyId(workspace.activeCompany?.id ?? inviteCompanyOptions[0]?.value ?? '');
      setIsInviteDialogOpen(false);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to send invitation';
      toast.error(message);
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleDeleteUser = async (user: UserSummary) => {
    if (user.isCurrentUser) {
      toast.error('You cannot delete your own account');
      return;
    }

    const confirmed = await confirm({
      title: 'Delete user',
      description: `Delete ${user.name} (${user.email})? This removes their access, memberships, and active sessions.`,
      confirmLabel: 'Delete user',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      await apiRequest<void>(`/api/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== user.id));
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser?.id === user.id ? null : currentSelectedUser,
      );
      toast.success('User deleted successfully');
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to delete user';
      toast.error(message);
    } finally {
      setDeletingUserId(null);
    }
  };

  if (!isSessionPending && session && session.user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#eef2ff] font-sans">
        <AppHeader />

        <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center p-6">
          <div className="w-full rounded-[28px] border border-white/70 bg-white/90 p-6 text-center shadow-[0_30px_120px_-50px_rgba(15,23,42,0.45)] sm:rounded-[32px] sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Access limited to administrators
            </h1>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">
              This workspace keeps the full users directory behind an admin role so account details stay private.
            </p>
            <div className="mt-8">
              <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_32%),linear-gradient(180deg,_#eef2ff_0%,_#f8fafc_32%,_#ffffff_100%)] font-sans pb-24 sm:pb-0">
      <AppHeader />

      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="rounded-[28px] border border-white/70 bg-white/80 p-4 shadow-[0_30px_120px_-50px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-[32px] sm:p-6">
          <div className="flex justify-end">
            <div className="grid w-full gap-3 min-[480px]:grid-cols-2 xl:max-w-[620px] xl:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,0.8fr))]">
              <label className="relative block min-[480px]:col-span-2 xl:col-span-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, email, or role"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <PopoverSelect
                value={roleFilter}
                onValueChange={setRoleFilter}
                options={roleFilterOptions}
                ariaLabel="Filter users by role"
                triggerClassName="h-12"
              />

              <PopoverSelect
                value={verificationFilter}
                onValueChange={setVerificationFilter}
                options={verificationFilterOptions}
                ariaLabel="Filter users by verification state"
                triggerClassName="h-12"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total users"
              value={stats.totalUsers}
              accent="bg-indigo-50 text-indigo-700"
              icon={<Users className="h-6 w-6" />}
            />
            <StatCard
              label="Administrators"
              value={stats.adminCount}
              accent="bg-sky-50 text-sky-700"
              icon={<ShieldCheck className="h-6 w-6" />}
            />
            <StatCard
              label="Verified accounts"
              value={stats.verifiedCount}
              accent="bg-emerald-50 text-emerald-700"
              icon={<CheckCircle2 className="h-6 w-6" />}
            />
            <StatCard
              label="Live sessions"
              value={stats.activeSessions}
              accent="bg-amber-50 text-amber-700"
              icon={<Clock3 className="h-6 w-6" />}
            />
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-white/70 bg-white/90 shadow-[0_30px_120px_-50px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-[32px]">
            <div className="flex flex-col gap-4 border-b border-slate-200/80 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">All users</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredUsers.length} of {users.length} accounts in view
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                className="w-full justify-center gap-2 sm:w-auto"
                onClick={() => setIsInviteDialogOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Invite user
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center gap-2 sm:w-auto"
                onClick={loadUsers}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-6">
            {isLoading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-3xl border border-slate-200/80 bg-slate-100/80"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-[28px] border border-red-100 bg-red-50 px-4 py-8 text-center sm:px-6 sm:py-10">
                <p className="text-lg font-semibold text-red-700">{error}</p>
                <p className="mt-2 text-sm text-red-600">
                  Check your role or try refreshing the page once the backend is available.
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 px-4 py-10 text-center sm:px-6 sm:py-12">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">No users match the current filters</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Try a broader search, or reset the role and verification filters.
                </p>
              </div>
            ) : (
              <>
                <UsersCardList users={filteredUsers} onOpenDetails={openUserDetails} />
                <UsersTable users={filteredUsers} onOpenDetails={openUserDetails} />
              </>
            )}
          </div>
        </section>
      </main>

      <UserDetailsDialog
        user={selectedUser}
        isDeleting={selectedUser ? deletingUserId === selectedUser.id : false}
        onDelete={() => {
          if (selectedUser) {
            void handleDeleteUser(selectedUser);
          }
        }}
        onClose={() => setSelectedUser(null)}
      />
      <InviteUserDialog
        isOpen={isInviteDialogOpen}
        email={inviteEmail}
        role={inviteRole}
        companyId={inviteCompanyId}
        companyOptions={inviteCompanyOptions}
        isSubmitting={isSendingInvite}
        onEmailChange={setInviteEmail}
        onRoleChange={setInviteRole}
        onCompanyChange={setInviteCompanyId}
        onClose={() => {
          if (isSendingInvite) {
            return;
          }
          setIsInviteDialogOpen(false);
        }}
        onSubmit={() => void handleSendInvitation()}
      />
    </div>
  );
}
