create table if not exists saved_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_by_user_id text references "user"(id) on delete set null,
  client_company_name text not null,
  client_email text not null,
  client_phone text not null,
  client_street text not null,
  client_house_number text not null,
  client_city text not null,
  client_postal_code text not null,
  last_used_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

alter table invoices
add column if not exists saved_client_id uuid references saved_clients(id) on delete set null;

create index if not exists saved_clients_company_id_idx
  on saved_clients (company_id);

create index if not exists saved_clients_created_by_user_id_idx
  on saved_clients (created_by_user_id);

create index if not exists saved_clients_company_name_idx
  on saved_clients (company_id, client_company_name);

create index if not exists saved_clients_company_last_used_idx
  on saved_clients (company_id, last_used_at, updated_at);

create index if not exists invoices_saved_client_id_idx
  on invoices (saved_client_id);
