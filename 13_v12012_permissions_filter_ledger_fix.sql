-- DREAMFOREN v120.12 권한 보정 + 팀별 먼지 여지관리대장
-- 기존 데이터는 삭제하지 않으며 여러 번 실행해도 안전합니다.

alter table public.profiles add column if not exists access_permissions jsonb not null default '{}'::jsonb;

create or replace function public.dreampoen_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true) $$;
revoke all on function public.dreampoen_is_admin() from public;
grant execute on function public.dreampoen_is_admin() to authenticated;

create table if not exists public.quality_documents (
  id uuid primary key default gen_random_uuid(), category text not null, doc_no text default '',
  title text not null, version text not null default '0', status text not null default 'active',
  content text default '', file_name text, storage_path text, mime_type text, file_size bigint not null default 0,
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.quality_documents enable row level security;
insert into storage.buckets(id,name,public,file_size_limit) values('quality-documents','quality-documents',false,52428800)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

grant select on public.quality_documents to authenticated;
grant insert,update,delete on public.quality_documents to authenticated;
drop policy if exists "quality documents authenticated read" on public.quality_documents;
drop policy if exists "quality documents admin insert" on public.quality_documents;
drop policy if exists "quality documents admin update" on public.quality_documents;
drop policy if exists "quality documents admin delete" on public.quality_documents;
create policy "quality documents authenticated read" on public.quality_documents for select to authenticated using (true);
create policy "quality documents admin insert" on public.quality_documents for insert to authenticated with check (public.dreampoen_is_admin());
create policy "quality documents admin update" on public.quality_documents for update to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
create policy "quality documents admin delete" on public.quality_documents for delete to authenticated using (public.dreampoen_is_admin());

drop policy if exists "quality files admin insert" on storage.objects;
drop policy if exists "quality files admin update" on storage.objects;
drop policy if exists "quality files admin delete" on storage.objects;
create policy "quality files admin insert" on storage.objects for insert to authenticated with check (bucket_id='quality-documents' and public.dreampoen_is_admin());
create policy "quality files admin update" on storage.objects for update to authenticated using (bucket_id='quality-documents' and public.dreampoen_is_admin()) with check (bucket_id='quality-documents' and public.dreampoen_is_admin());
create policy "quality files admin delete" on storage.objects for delete to authenticated using (bucket_id='quality-documents' and public.dreampoen_is_admin());

-- 삭제된 자료실 접수번호가 오래된 모바일 캐시로 되살아나는 것을 DB에서도 차단합니다.
create or replace function public.dreampoen_keep_repository_tombstone()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce((old.measurement_data->>'deleted')::boolean,false)=true
     or coalesce((old.measurement_data->>'_deleted')::boolean,false)=true then
    new.measurement_data := old.measurement_data;
    new.analysis_data := null;
    new.measurement_updated_at := old.measurement_updated_at;
    new.analysis_updated_at := old.analysis_updated_at;
  end if;
  return new;
end $$;
drop trigger if exists dreampoen_repository_tombstone_guard on public.dreampoen_repository;
create trigger dreampoen_repository_tombstone_guard before update on public.dreampoen_repository
for each row execute function public.dreampoen_keep_repository_tombstone();

create table if not exists public.lab_teams(
  id uuid primary key default gen_random_uuid(), name text not null unique,
  sort_order integer not null default 0, active boolean not null default true,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
insert into public.lab_teams(name,sort_order) values ('1팀',1),('2팀',2) on conflict(name) do nothing;

create table if not exists public.filter_ledger_entries(
  id uuid primary key default gen_random_uuid(), receipt_no text not null unique,
  measure_date date, company_name text, facility_name text,
  team_id uuid references public.lab_teams(id), filter_no text default '',
  before_weight numeric(12,6), after_weight numeric(12,6), memo text default '',
  updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists filter_ledger_team_date_idx on public.filter_ledger_entries(team_id,measure_date desc);

create table if not exists public.filter_ledger_signatures(
  id uuid primary key default gen_random_uuid(), team_id uuid not null references public.lab_teams(id),
  year integer not null, writer text default '', reviewer text default '', approver text default '',
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), unique(team_id,year)
);

alter table public.lab_teams enable row level security;
alter table public.filter_ledger_entries enable row level security;
alter table public.filter_ledger_signatures enable row level security;
grant select on public.lab_teams,public.filter_ledger_entries,public.filter_ledger_signatures to authenticated;
grant insert,update,delete on public.lab_teams,public.filter_ledger_entries,public.filter_ledger_signatures to authenticated;

drop policy if exists "lab teams read" on public.lab_teams;
drop policy if exists "lab teams admin write" on public.lab_teams;
create policy "lab teams read" on public.lab_teams for select to authenticated using (true);
create policy "lab teams admin write" on public.lab_teams for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

drop policy if exists "filter ledger read" on public.filter_ledger_entries;
drop policy if exists "filter ledger write" on public.filter_ledger_entries;
create policy "filter ledger read" on public.filter_ledger_entries for select to authenticated using (true);
create policy "filter ledger write" on public.filter_ledger_entries for all to authenticated using (true) with check (true);

drop policy if exists "filter signatures read" on public.filter_ledger_signatures;
drop policy if exists "filter signatures write" on public.filter_ledger_signatures;
create policy "filter signatures read" on public.filter_ledger_signatures for select to authenticated using (true);
create policy "filter signatures write" on public.filter_ledger_signatures for all to authenticated using (true) with check (true);
