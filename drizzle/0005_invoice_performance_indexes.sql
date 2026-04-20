create index if not exists company_memberships_company_role_user_idx
  on company_memberships (company_id, role, user_id);

create index if not exists invoices_company_user_updated_at_idx
  on invoices (company_id, user_id, updated_at desc, created_at desc);

create index if not exists services_invoice_id_idx
  on services (invoice_id);
