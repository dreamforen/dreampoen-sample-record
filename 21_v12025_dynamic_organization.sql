-- DREAMFOREN v120.25 dynamic organization chart
create table if not exists public.dreampoen_organization_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.dreampoen_organization_nodes(id) on delete cascade,
  name text not null,
  node_type text not null default 'department' check (node_type in ('position','department','team','person')),
  profile_id uuid references public.profiles(id) on delete set null,
  description text not null default '',
  row_offset integer not null default 1 check (row_offset between 0 and 9),
  sort_order integer not null default 0,
  color text not null default '#4f9b43',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists dreampoen_organization_parent_idx
  on public.dreampoen_organization_nodes(parent_id, row_offset, sort_order);

alter table public.dreampoen_organization_nodes enable row level security;
drop policy if exists "organization authenticated read" on public.dreampoen_organization_nodes;
create policy "organization authenticated read" on public.dreampoen_organization_nodes
  for select to authenticated using (true);
drop policy if exists "organization admin insert" on public.dreampoen_organization_nodes;
create policy "organization admin insert" on public.dreampoen_organization_nodes
  for insert to authenticated with check (public.dreampoen_is_admin());
drop policy if exists "organization admin update" on public.dreampoen_organization_nodes;
create policy "organization admin update" on public.dreampoen_organization_nodes
  for update to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());
drop policy if exists "organization admin delete" on public.dreampoen_organization_nodes;
create policy "organization admin delete" on public.dreampoen_organization_nodes
  for delete to authenticated using (public.dreampoen_is_admin());

grant select on public.dreampoen_organization_nodes to authenticated;
grant insert,update,delete on public.dreampoen_organization_nodes to authenticated;

create or replace function public.dreampoen_touch_organization_node()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists touch_dreampoen_organization_node on public.dreampoen_organization_nodes;
create trigger touch_dreampoen_organization_node before update on public.dreampoen_organization_nodes
for each row execute function public.dreampoen_touch_organization_node();

-- 최초 설치 때만 예시 최상위 조직을 만듭니다. 이후에는 관리자 화면에서 자유롭게 변경합니다.
insert into public.dreampoen_organization_nodes(name,node_type,row_offset,sort_order,color)
select '대표이사','position',0,0,'#aeb4b8'
where not exists(select 1 from public.dreampoen_organization_nodes);
