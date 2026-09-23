-- DREAMFOREN v120.37.17.0
-- DFEN-QPF-17-04 (01) 시료접수 및 성적서 발송대장
-- 기존 일정/자료실/품질문서 데이터는 변경하거나 삭제하지 않습니다.

create or replace function public.dreampoen_can_use_quality_form()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.active=true
      and (
        p.role='admin'
        or coalesce((p.access_permissions->>'quality_form')::boolean,true)=true
      )
  )
$$;
revoke all on function public.dreampoen_can_use_quality_form() from public;
grant execute on function public.dreampoen_can_use_quality_form() to authenticated;

create table if not exists public.qpf_17_04_entries (
  id uuid primary key default gen_random_uuid(),
  record_year integer not null check (record_year between 2000 and 2100),
  source_type text not null default 'manual' check (source_type in ('manual','schedule')),
  source_key text unique,
  schedule_id text,
  measurement_no text not null default '',
  measurement_date date,
  sample_receipt_date date,
  request_org text not null default '',
  target_site text not null default '',
  facility text not null default '',
  measurement_items text not null default '',
  handover_person text not null default '',
  receiver_person text not null default '',
  analysis_manager text not null default '',
  technical_manager text not null default '',
  dispatch_date date,
  note text not null default '',
  sort_order bigint not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create index if not exists qpf_17_04_year_sort_idx
  on public.qpf_17_04_entries(record_year,sort_order,id)
  where archived_at is null;
create index if not exists qpf_17_04_measurement_date_idx
  on public.qpf_17_04_entries(measurement_date desc)
  where archived_at is null;
create index if not exists qpf_17_04_schedule_idx
  on public.qpf_17_04_entries(schedule_id)
  where source_type='schedule' and archived_at is null;

create table if not exists public.qpf_17_04_signatures (
  id uuid primary key default gen_random_uuid(),
  record_year integer not null unique check (record_year between 2000 and 2100),
  writer text not null default '',
  technical_manager text not null default '',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.qpf_17_04_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists qpf_17_04_entries_touch on public.qpf_17_04_entries;
create trigger qpf_17_04_entries_touch
before update on public.qpf_17_04_entries
for each row execute function public.qpf_17_04_touch_updated_at();

drop trigger if exists qpf_17_04_signatures_touch on public.qpf_17_04_signatures;
create trigger qpf_17_04_signatures_touch
before update on public.qpf_17_04_signatures
for each row execute function public.qpf_17_04_touch_updated_at();

alter table public.qpf_17_04_entries enable row level security;
alter table public.qpf_17_04_signatures enable row level security;

grant select,insert,update,delete on public.qpf_17_04_entries to authenticated;
grant select,insert,update,delete on public.qpf_17_04_signatures to authenticated;

drop policy if exists "qpf 17 04 read" on public.qpf_17_04_entries;
drop policy if exists "qpf 17 04 insert" on public.qpf_17_04_entries;
drop policy if exists "qpf 17 04 update" on public.qpf_17_04_entries;
drop policy if exists "qpf 17 04 delete" on public.qpf_17_04_entries;
create policy "qpf 17 04 read" on public.qpf_17_04_entries
  for select to authenticated using (public.dreampoen_can_use_quality_form());
create policy "qpf 17 04 insert" on public.qpf_17_04_entries
  for insert to authenticated with check (public.dreampoen_can_edit_quality());
create policy "qpf 17 04 update" on public.qpf_17_04_entries
  for update to authenticated using (public.dreampoen_can_edit_quality())
  with check (public.dreampoen_can_edit_quality());
create policy "qpf 17 04 delete" on public.qpf_17_04_entries
  for delete to authenticated using (public.dreampoen_is_admin());

drop policy if exists "qpf 17 04 signatures read" on public.qpf_17_04_signatures;
drop policy if exists "qpf 17 04 signatures insert" on public.qpf_17_04_signatures;
drop policy if exists "qpf 17 04 signatures update" on public.qpf_17_04_signatures;
drop policy if exists "qpf 17 04 signatures delete" on public.qpf_17_04_signatures;
create policy "qpf 17 04 signatures read" on public.qpf_17_04_signatures
  for select to authenticated using (public.dreampoen_can_use_quality_form());
create policy "qpf 17 04 signatures insert" on public.qpf_17_04_signatures
  for insert to authenticated with check (public.dreampoen_can_edit_quality());
create policy "qpf 17 04 signatures update" on public.qpf_17_04_signatures
  for update to authenticated using (public.dreampoen_can_edit_quality())
  with check (public.dreampoen_can_edit_quality());
create policy "qpf 17 04 signatures delete" on public.qpf_17_04_signatures
  for delete to authenticated using (public.dreampoen_is_admin());

-- 완료된 측정일정을 기본 대장 행으로 안전하게 생성합니다.
-- source_key 고유값과 on conflict do nothing으로 재저장/동시저장 중복을 차단합니다.
create or replace function public.qpf_17_04_seed_schedule(
  p_schedule_id text,
  p_schedule_date date,
  p_schedule_type text,
  p_employee text,
  p_company_id text,
  p_extra_data jsonb,
  p_completed boolean,
  p_status text
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_extra jsonb := coalesce(p_extra_data,'{}'::jsonb);
  v_names jsonb := '[]'::jsonb;
  v_company text := '';
  v_deleted boolean := false;
  v_year integer;
  v_item record;
begin
  if p_schedule_id is null or p_schedule_date is null then return; end if;
  if not (coalesce(p_completed,false)=true or coalesce(p_status,'')='completed') then return; end if;
  if position('측정' in coalesce(p_schedule_type,''))=0 then return; end if;

  begin
    v_deleted := coalesce((v_extra->>'deleted')::boolean,false);
  exception when others then
    v_deleted := false;
  end;
  if v_deleted then return; end if;

  if jsonb_typeof(v_extra->'companies')='array' then
    v_names := v_extra->'companies';
  end if;
  if jsonb_array_length(v_names)=0 and nullif(btrim(v_extra->>'company'),'') is not null then
    v_names := jsonb_build_array(btrim(v_extra->>'company'));
  end if;
  if jsonb_array_length(v_names)=0 and nullif(btrim(coalesce(p_company_id,'')),'') is not null then
    select coalesce(c.name,'') into v_company
    from public.companies c
    where c.id::text=p_company_id
    limit 1;
    if nullif(btrim(coalesce(v_company,'')),'') is not null then
      v_names := jsonb_build_array(btrim(v_company));
    end if;
  end if;
  if jsonb_array_length(v_names)=0 then
    v_names := jsonb_build_array('');
  end if;

  v_year := extract(year from p_schedule_date)::integer;
  for v_item in
    select value as company_name, ordinality as company_order
    from jsonb_array_elements_text(v_names) with ordinality
  loop
    v_company := btrim(coalesce(v_item.company_name,''));
    insert into public.qpf_17_04_entries(
      record_year,source_type,source_key,schedule_id,
      measurement_date,sample_receipt_date,request_org,target_site,
      handover_person,note,sort_order,created_by,updated_by
    ) values (
      v_year,'schedule',
      'schedule:'||p_schedule_id||':company:'||v_item.company_order::text||':base',
      p_schedule_id,p_schedule_date,p_schedule_date,v_company,v_company,
      coalesce(p_employee,''),'일정완료 자동생성',
      floor(extract(epoch from clock_timestamp())*1000)::bigint+v_item.company_order,
      auth.uid(),auth.uid()
    )
    on conflict (source_key) do nothing;
  end loop;
end
$$;
revoke all on function public.qpf_17_04_seed_schedule(text,date,text,text,text,jsonb,boolean,text) from public,authenticated;

create or replace function public.qpf_17_04_schedule_completed_trigger()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  perform public.qpf_17_04_seed_schedule(
    new.id::text,new.schedule_date,new.schedule_type,new.employee,
    new.company_id::text,new.extra_data,new.completed,new.status
  );
  return new;
end
$$;
revoke all on function public.qpf_17_04_schedule_completed_trigger() from public,authenticated;

drop trigger if exists qpf_17_04_schedule_completed on public.schedules;
create trigger qpf_17_04_schedule_completed
after insert or update of completed,status,schedule_date,schedule_type,employee,company_id,extra_data
on public.schedules
for each row execute function public.qpf_17_04_schedule_completed_trigger();

-- 마이그레이션 이전에 이미 완료된 측정일정도 빠짐없이 기본 행을 생성합니다.
select public.qpf_17_04_seed_schedule(
  s.id::text,s.schedule_date,s.schedule_type,s.employee,
  s.company_id::text,s.extra_data,s.completed,s.status
)
from public.schedules s
where (coalesce(s.completed,false)=true or s.status='completed')
  and position('측정' in coalesce(s.schedule_type,''))>0;

comment on table public.qpf_17_04_entries is
  'DFEN-QPF-17-04 (01) 시료접수 및 성적서 발송대장';
comment on table public.qpf_17_04_signatures is
  'DFEN-QPF-17-04 연도별 작성자/책임기술자 결재란';
