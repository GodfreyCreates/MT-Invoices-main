import React from 'react';
import type { CompanyFormValues } from '../../lib/company';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

type CompanyProfileFormProps = {
  values: CompanyFormValues;
  onChange: <K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) => void;
  readOnly?: boolean;
};

function Field({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  optional = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <Label>
        {label}
        {optional ? <span className="ml-1 text-slate-400">(Optional)</span> : null}
      </Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={readOnly}
        className="h-11 rounded-2xl border-slate-200 bg-white"
      />
    </div>
  );
}

export function CompanyProfileForm({
  values,
  onChange,
  readOnly = false,
}: CompanyProfileFormProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Company name"
        value={values.name}
        onChange={(value) => onChange('name', value)}
        readOnly={readOnly}
        className="md:col-span-2"
      />
      <Field
        label="Company email"
        value={values.email}
        onChange={(value) => onChange('email', value)}
        readOnly={readOnly}
        placeholder="company@example.com"
      />
      <Field
        label="Company phone"
        value={values.phone}
        onChange={(value) => onChange('phone', value)}
        readOnly={readOnly}
        placeholder="+27..."
      />
      <Field
        label="P.O. Box"
        value={values.poBox}
        onChange={(value) => onChange('poBox', value)}
        readOnly={readOnly}
        optional
      />
      <Field
        label="Stand number"
        value={values.standNumber}
        onChange={(value) => onChange('standNumber', value)}
        readOnly={readOnly}
        optional
      />
      <Field
        label="Street address"
        value={values.streetAddress}
        onChange={(value) => onChange('streetAddress', value)}
        readOnly={readOnly}
        className="md:col-span-2"
      />

      <div className="md:col-span-2 pt-2">
        <p className="text-sm font-semibold text-slate-900">Bank details</p>
        <p className="mt-1 text-sm text-slate-500">
          These values will appear directly on exported invoices for this company.
        </p>
      </div>

      <Field
        label="Bank name"
        value={values.bankName}
        onChange={(value) => onChange('bankName', value)}
        readOnly={readOnly}
      />
      <Field
        label="Account holder"
        value={values.accountHolder}
        onChange={(value) => onChange('accountHolder', value)}
        readOnly={readOnly}
      />
      <Field
        label="Account number"
        value={values.accountNumber}
        onChange={(value) => onChange('accountNumber', value)}
        readOnly={readOnly}
      />
      <Field
        label="Account type"
        value={values.accountType}
        onChange={(value) => onChange('accountType', value)}
        readOnly={readOnly}
      />
      <Field
        label="Branch code"
        value={values.branchCode}
        onChange={(value) => onChange('branchCode', value)}
        readOnly={readOnly}
      />
    </div>
  );
}
