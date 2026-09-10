-- DREAMFOREN v120.13 자료숨김·계약강제매칭·입찰관리
alter table public.dreampoen_repository add column if not exists hidden boolean not null default false;

create table if not exists public.contract_company_links(
  contract_id uuid primary key references public.contracts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  linked_by uuid references auth.users(id), linked_at timestamptz not null default now()
);
alter table public.contract_company_links enable row level security;
grant select,insert,update,delete on public.contract_company_links to authenticated;
drop policy if exists "contract links admin all" on public.contract_company_links;
create policy "contract links admin all" on public.contract_company_links for all to authenticated
using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

create table if not exists public.bid_records(
  id uuid primary key default gen_random_uuid(), title text not null, agency text default '',
  deadline timestamptz not null, estimated_price numeric(18,2) not null default 0,
  base_amount numeric(18,2) not null default 0, vat_mode text not null default 'included',
  lower_rate numeric(8,4) not null default 87.745, range_percent numeric(8,4) not null default 2,
  preliminary_count integer not null default 15, our_bid_amount numeric(18,2) not null default 0,
  winning_amount numeric(18,2) not null default 0,
  status text not null default 'open' check(status in ('open','submitted','abandoned','won','lost')),
  memo text default '', created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists bid_records_deadline_idx on public.bid_records(deadline desc);
alter table public.bid_records enable row level security;
grant select,insert,update,delete on public.bid_records to authenticated;
drop policy if exists "bid records admin all" on public.bid_records;
create policy "bid records admin all" on public.bid_records for all to authenticated
using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
