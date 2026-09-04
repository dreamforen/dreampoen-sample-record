-- DREAMFOREN v120.21 독립형 매출·수금 ERP
-- 계약(contracts), 업체현황(companies)과 외래키 및 조회 연결이 없습니다.

create table if not exists public.erp_customers(
  customer_key text primary key,
  company_name text not null,
  biz_no text default '',
  representative text default '',
  phone text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_invoices(
  unique_key text primary key,
  customer_key text not null references public.erp_customers(customer_key) on update cascade,
  issue_date date,
  approval_no text default '',
  total_amount numeric not null default 0,
  supply_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  item_name text default '',
  source_file text default '',
  status text not null default 'active' check(status in ('active','excluded')),
  created_at timestamptz not null default now()
);

create table if not exists public.erp_payments(
  unique_key text primary key,
  payment_date date,
  depositor_name text default '',
  description text default '',
  bank_name text default '',
  amount numeric not null default 0,
  source_file text default '',
  matched_customer_key text references public.erp_customers(customer_key) on update cascade on delete set null,
  match_method text default '',
  status text not null default 'pending' check(status in ('pending','matched','excluded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_customer_aliases(
  alias_key text primary key,
  alias_name text not null,
  customer_key text not null references public.erp_customers(customer_key) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists erp_invoice_customer_idx on public.erp_invoices(customer_key,issue_date desc);
create index if not exists erp_payment_status_idx on public.erp_payments(status,payment_date desc);
create index if not exists erp_payment_customer_idx on public.erp_payments(matched_customer_key,payment_date desc);

alter table public.erp_customers enable row level security;
alter table public.erp_invoices enable row level security;
alter table public.erp_payments enable row level security;
alter table public.erp_customer_aliases enable row level security;

grant select,insert,update,delete on public.erp_customers,public.erp_invoices,public.erp_payments,public.erp_customer_aliases to authenticated;

drop policy if exists "erp admin all" on public.erp_customers;
drop policy if exists "erp admin all" on public.erp_invoices;
drop policy if exists "erp admin all" on public.erp_payments;
drop policy if exists "erp admin all" on public.erp_customer_aliases;
create policy "erp admin all" on public.erp_customers for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
create policy "erp admin all" on public.erp_invoices for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
create policy "erp admin all" on public.erp_payments for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
create policy "erp admin all" on public.erp_customer_aliases for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

notify pgrst, 'reload schema';
