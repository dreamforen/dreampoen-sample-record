-- DREAMFOREN v120.37.12 · 독립 계약문서 작성/누적관리
-- 중요: 기존 contracts, companies 및 업체현황 관련 테이블을 조회·수정·연결하지 않습니다.
-- 이 파일은 Supabase SQL Editor에서 한 번만 실행하면 됩니다.

create table if not exists public.contract_document_packages(
  id uuid primary key default gen_random_uuid(),
  document_no text not null,
  package_name text not null,
  client_name text not null,
  contract_date date,
  start_date date,
  end_date date,
  status text not null default 'draft' check(status in ('draft','complete')),
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_document_packages_document_no_uidx
  on public.contract_document_packages(document_no);
create index if not exists contract_document_packages_updated_idx
  on public.contract_document_packages(updated_at desc);
create index if not exists contract_document_packages_client_idx
  on public.contract_document_packages(client_name);
create index if not exists contract_document_packages_contract_date_idx
  on public.contract_document_packages(contract_date desc);

create or replace function public.dreampoen_contract_document_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end
$$;

drop trigger if exists contract_document_packages_touch_updated_at on public.contract_document_packages;
create trigger contract_document_packages_touch_updated_at
before update on public.contract_document_packages
for each row execute function public.dreampoen_contract_document_touch_updated_at();

alter table public.contract_document_packages enable row level security;
grant select,insert,update,delete on public.contract_document_packages to authenticated;

drop policy if exists "contract documents admin all" on public.contract_document_packages;
create policy "contract documents admin all"
on public.contract_document_packages
for all
to authenticated
using (public.dreampoen_is_admin())
with check (public.dreampoen_is_admin());

comment on table public.contract_document_packages is
  '작성용 표준계약서·과업수행계획서·체결사실통보서·계약체결현황 독립 문서세트. 계약/업체현황 무연동.';

notify pgrst, 'reload schema';
