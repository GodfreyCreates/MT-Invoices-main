import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ImageUp,
  Loader2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { PopoverSelect, type PopoverSelectOption } from '../ui/PopoverSelect';
import { CompanyProfileForm } from './CompanyProfileForm';
import { ApiError, apiRequest } from '../../lib/api';
import {
  createEmptyCompanyFormValues,
  getCompanyRoleLabel,
  type CompanyDetailResponse,
  type CompanyFormValues,
  type CompanyMember,
  type CompanyRole,
} from '../../lib/company';
import {
  createSupabaseFunctionHeaders,
  getSupabaseFunctionUrl,
  invokeSupabaseFunctionWithSession,
} from '../../lib/supabase-functions';
import { getSupabaseAccessToken } from '../../lib/supabase';
import { uploadFileToApi } from '../../lib/uploads';
import { toast } from 'sonner';

type CompanySettingsModalProps = {
  companyId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
};

type CompanyLogoMutationResponse = {
  target: 'company-logo';
  publicUrl: string | null;
  objectPath: string | null;
  companyId: string;
};

const companyMemberRoleOptions: PopoverSelectOption<CompanyRole>[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
];

function formatDate(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
  }).format(parsed);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim() || 'CO';
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

function toCompanyFormValues(detail: CompanyDetailResponse | null): CompanyFormValues {
  if (!detail) {
    return createEmptyCompanyFormValues();
  }

  return {
    name: detail.company.name,
    email: detail.company.email,
    phone: detail.company.phone,
    poBox: detail.company.poBox ?? '',
    streetAddress: detail.company.streetAddress,
    standNumber: detail.company.standNumber ?? '',
    bankName: detail.company.bankName,
    accountHolder: detail.company.accountHolder,
    accountNumber: detail.company.accountNumber,
    accountType: detail.company.accountType,
    branchCode: detail.company.branchCode,
  };
}

export function CompanySettingsModal({
  companyId,
  isOpen,
  onClose,
  onUpdated,
}: CompanySettingsModalProps) {
  const [detail, setDetail] = useState<CompanyDetailResponse | null>(null);
  const [form, setForm] = useState<CompanyFormValues>(createEmptyCompanyFormValues());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const loadCompanyDetail = async () => {
    if (!companyId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextDetail = await apiRequest<CompanyDetailResponse>(`/api/companies/${companyId}`);
      setDetail(nextDetail);
      setForm(toCompanyFormValues(nextDetail));
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Failed to load company details';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !companyId) {
      return;
    }

    void loadCompanyDetail();
  }, [companyId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const canEditCompany = Boolean(detail?.company.permissions.canEditCompany);
  const canManageMembers = Boolean(detail?.company.permissions.canManageMembers);
  const company = detail?.company ?? null;
  const members = detail?.members ?? [];

  const handleCompanyChange = <K extends keyof CompanyFormValues>(
    field: K,
    value: CompanyFormValues[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyId) {
      return;
    }

    setIsSaving(true);
    try {
      const nextDetail = await apiRequest<CompanyDetailResponse>(`/api/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setDetail(nextDetail);
      setForm(toCompanyFormValues(nextDetail));
      await onUpdated?.();
      toast.success('Company details updated');
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to update company details';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!companyId) {
      return;
    }

    const input = event.currentTarget;
    const files = input.files ? (Array.from(input.files) as File[]) : [];
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const [file] = files;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    try {
      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) {
        throw new Error('You must be signed in to upload a company logo');
      }

      setIsUploadingLogo(true);
      await uploadFileToApi<CompanyLogoMutationResponse>({
        url: getSupabaseFunctionUrl('auth-storage-images'),
        file,
        accessToken,
        fields: {
          target: 'company-logo',
          companyId,
        },
        headers: createSupabaseFunctionHeaders(),
        onProgress: setUploadProgress,
      });
      setUploadProgress(100);
      await Promise.all([loadCompanyDetail(), onUpdated?.()]);
      toast.success('Company logo updated successfully');
      window.setTimeout(() => {
        setUploadProgress(0);
      }, 600);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Upload failed');
      setUploadProgress(0);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!companyId) {
      return;
    }

    setIsRemovingLogo(true);
    try {
      await invokeSupabaseFunctionWithSession<CompanyLogoMutationResponse>('auth-storage-images', {
        action: 'delete',
        target: 'company-logo',
        companyId,
      }, 'DELETE');
      await Promise.all([loadCompanyDetail(), onUpdated?.()]);
      setUploadProgress(0);
      toast.success('Company logo removed');
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to remove the company logo';
      toast.error(message);
    } finally {
      setIsRemovingLogo(false);
    }
  };

  const handleRoleChange = async (member: CompanyMember, role: CompanyRole) => {
    if (!companyId) {
      return;
    }

    setMemberActionId(member.id);
    try {
      const nextDetail = await apiRequest<CompanyDetailResponse>(
        `/api/companies/${companyId}/members/${member.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        },
      );
      setDetail(nextDetail);
      await onUpdated?.();
      toast.success('Member role updated');
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to update this member';
      toast.error(message);
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRemoveMember = async (member: CompanyMember) => {
    if (!companyId) {
      return;
    }

    setMemberActionId(member.id);
    try {
      const nextDetail = await apiRequest<CompanyDetailResponse>(
        `/api/companies/${companyId}/members/${member.id}`,
        {
          method: 'DELETE',
        },
      );
      setDetail(nextDetail);
      await onUpdated?.();
      toast.success('Member removed from company');
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to remove this member';
      toast.error(message);
    } finally {
      setMemberActionId(null);
    }
  };

  const membersSummary = useMemo(() => {
    return `${members.length} member${members.length === 1 ? '' : 's'}`;
  }, [members.length]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[32px] border border-slate-200 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.45)] sm:rounded-[32px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-8">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
              <Building2 className="h-3.5 w-3.5" />
              Company settings
            </p>
            <h2 className="mt-4 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {company?.name ?? 'Loading company'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {company ? (
                <>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {getCompanyRoleLabel(company.membershipRole)}
                  </span>
                  <span>{membersSummary}</span>
                  <span>Updated {formatDateTime(company.updatedAt)}</span>
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="Close company settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {isLoading ? (
            <div className="flex min-h-80 items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading company settings...
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-10 text-center">
              <p className="text-base font-semibold text-red-700">{error}</p>
              <Button
                variant="outline"
                onClick={() => void loadCompanyDetail()}
                className="mt-4 h-10 rounded-2xl px-4"
              >
                Retry
              </Button>
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                        {company.documentLogoUrl ? (
                          <img
                            src={company.documentLogoUrl}
                            alt={company.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold tracking-[0.2em] text-white">
                            {company.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                          {company.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {canEditCompany
                            ? 'Document branding and issuer details for this company.'
                            : 'You have read-only access to this company profile.'}
                        </p>
                        <div className="mt-3 grid gap-1 text-sm text-slate-500">
                          <span>Created {formatDate(company.createdAt)}</span>
                          <span>Updated {formatDateTime(company.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoSelection}
                      disabled={!canEditCompany}
                    />

                    {uploadProgress > 0 && isUploadingLogo ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Uploading company logo</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-blue-900 transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {canEditCompany ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isUploadingLogo || isRemovingLogo}
                          className="h-11 rounded-2xl px-5"
                        >
                          {isUploadingLogo ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading
                            </>
                          ) : (
                            <>
                              <ImageUp className="mr-2 h-4 w-4" />
                              {company.documentLogoUrl ? 'Replace logo' : 'Upload logo'}
                            </>
                          )}
                        </Button>
                        {company.documentLogoUrl ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleRemoveLogo()}
                            disabled={isUploadingLogo || isRemovingLogo}
                            className="h-11 rounded-2xl px-5"
                          >
                            {isRemovingLogo ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Removing
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove logo
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        Only company owners and admins can update the document logo.
                      </p>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <form className="space-y-5" onSubmit={handleSaveCompany}>
                    <CompanyProfileForm
                      values={form}
                      onChange={handleCompanyChange}
                      readOnly={!canEditCompany}
                    />

                    <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-500">
                        {canEditCompany
                          ? 'These values feed the issuer profile and bank details on invoices for this company.'
                          : 'Only company owners and admins can edit company details.'}
                      </p>
                      {canEditCompany ? (
                        <Button type="submit" disabled={isSaving} className="h-11 rounded-2xl px-5">
                          {isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving company
                            </>
                          ) : (
                            'Save changes'
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </form>
                </section>
              </div>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      <Users className="h-3.5 w-3.5" />
                      Company members
                    </div>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                      Access for this workspace
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Review current members and adjust access where your role allows it.
                    </p>
                  </div>
                  {detail.company.permissions.canAddMembers ? (
                    <p className="max-w-xs text-sm text-slate-500 sm:text-right">
                      Add new members from the admin assignment panel on the Companies page.
                    </p>
                  ) : null}
                </div>

                <div className="mt-5 space-y-3">
                  {members.map((member) => {
                    const isBusy = memberActionId === member.id;
                    const initials = getInitials(member.name, member.email);

                    return (
                      <article
                        key={member.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-start gap-3">
                            {member.image ? (
                              <img
                                src={member.image}
                                alt={member.name}
                                className="h-11 w-11 rounded-2xl border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-semibold text-slate-950">{member.name}</p>
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                                  {getCompanyRoleLabel(member.membershipRole)}
                                </span>
                                {member.isCurrentUser ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                    <ShieldCheck className="h-3 w-3" />
                                    You
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 break-all text-sm text-slate-500">{member.email}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                                Joined {formatDate(member.joinedAt)}
                              </p>
                            </div>
                          </div>

                          {canManageMembers ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <PopoverSelect
                                value={member.membershipRole}
                                onValueChange={(value) => void handleRoleChange(member, value)}
                                options={companyMemberRoleOptions}
                                disabled={!member.canChangeRole || member.isCurrentUser || isBusy}
                                ariaLabel={`Change role for ${member.name}`}
                                triggerClassName="h-10 min-w-[148px]"
                              />
                              {member.canRemove && !member.isCurrentUser ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => void handleRemoveMember(member)}
                                  className="h-10 rounded-2xl px-4 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Working...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remove
                                    </>
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 px-5 py-4 sm:px-8">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-2xl px-5">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
