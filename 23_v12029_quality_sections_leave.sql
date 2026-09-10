-- DREAMFOREN v120.29 장별 품질문서 개정 + 연차휴가 결재/대장
-- 22_v12028_internal_approval.sql 실행 후 1회 실행합니다.

alter table public.profiles add column if not exists hire_date date;
alter table public.profiles add column if not exists annual_leave_days numeric(5,2) not null default 15;

create table if not exists public.quality_manual_sections(
 id uuid primary key default gen_random_uuid(), section_code text not null unique, section_no text not null,
 title text not null, pdf_start_page integer not null, pdf_end_page integer not null,
 current_revision text not null default '02', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.quality_section_revisions(
 id uuid primary key default gen_random_uuid(), section_id uuid not null references public.quality_manual_sections(id) on delete cascade,
 revision text not null, status text not null default 'draft' check(status in('draft','submitted','active','obsolete','rejected')),
 content text not null default '', change_reason text not null default '', created_by uuid references public.profiles(id),
 approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(section_id,revision)
);

insert into public.quality_manual_sections(section_code,section_no,title,pdf_start_page,pdf_end_page) values
('DFEN-QM-01','1.1','일반사항',4,5),('DFEN-QM-02','2.1','조직',6,10),('DFEN-QM-03','2.2','품질시스템',11,13),
('DFEN-QM-04','2.3','문서 관리',14,16),('DFEN-QM-05','2.4','시험 의뢰 및 계약 시의 검토',17,17),('DFEN-QM-06','2.5','시험의 위탁',18,18),
('DFEN-QM-07','2.6','서비스 및 물품구매',19,19),('DFEN-QM-08','2.7','고객에 대한 서비스 및 불만사항',20,20),
('DFEN-QM-09','2.8','부적합 업무 관리 및 보완조치',21,22),('DFEN-QM-10','2.9','기록 관리',23,24),
('DFEN-QM-11','2.10','내부 정도관리 평가',25,25),('DFEN-QM-12','3.1','직원',26,27),('DFEN-QM-13','3.2','시설 및 환경조건',28,29),
('DFEN-QM-14','3.3','시험방법 및 유효성 확인',30,31),('DFEN-QM-15','3.4','시험장비 및 표준물질',32,33),
('DFEN-QM-16','3.5','시료채취',34,34),('DFEN-QM-17','3.6','시료관리',35,35),('DFEN-QM-18','3.7','시험결과의 보증',36,36),
('DFEN-QM-19','3.8','결과보고',37,37),('DFEN-QM-20','3.9','시험검사 성적서의 리스크 관리',38,38)
on conflict(section_code) do update set section_no=excluded.section_no,title=excluded.title,pdf_start_page=excluded.pdf_start_page,pdf_end_page=excluded.pdf_end_page;

create table if not exists public.leave_requests(
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
 leave_type text not null default 'annual' check(leave_type in('annual','half_am','half_pm','sick','special')),
 start_date date not null,end_date date not null,days numeric(5,2) not null check(days>0),reason text not null default '',
 status text not null default 'draft' check(status in('draft','submitted','approved','rejected','cancelled')),
 approval_document_id uuid references public.approval_documents(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.leave_ledger(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.profiles(id),leave_year integer not null,
 entry_type text not null check(entry_type in('grant','use','adjust','cancel')),days numeric(6,2) not null,note text not null default '',
 leave_request_id uuid references public.leave_requests(id) on delete set null,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),
 unique(leave_request_id,entry_type)
);

alter table public.approval_documents add column if not exists quality_section_revision_id uuid references public.quality_section_revisions(id) on delete set null;
alter table public.approval_documents add column if not exists leave_request_id uuid references public.leave_requests(id) on delete set null;

alter table public.quality_manual_sections enable row level security;alter table public.quality_section_revisions enable row level security;
alter table public.leave_requests enable row level security;alter table public.leave_ledger enable row level security;
grant select,insert,update,delete on public.quality_manual_sections,public.quality_section_revisions,public.leave_requests,public.leave_ledger to authenticated;
drop policy if exists "qms sections read" on public.quality_manual_sections;create policy "qms sections read" on public.quality_manual_sections for select to authenticated using(true);
drop policy if exists "qms sections admin" on public.quality_manual_sections;create policy "qms sections admin" on public.quality_manual_sections for all to authenticated using(public.df_approval_is_admin()) with check(public.df_approval_is_admin());
drop policy if exists "qms revisions read" on public.quality_section_revisions;create policy "qms revisions read" on public.quality_section_revisions for select to authenticated using(true);
drop policy if exists "qms revisions admin" on public.quality_section_revisions;create policy "qms revisions admin" on public.quality_section_revisions for all to authenticated using(public.df_approval_is_admin()) with check(public.df_approval_is_admin());
drop policy if exists "leave own read" on public.leave_requests;create policy "leave own read" on public.leave_requests for select to authenticated using(employee_id=auth.uid() or public.df_approval_is_admin() or public.df_approval_can_read(approval_document_id));
drop policy if exists "leave own insert" on public.leave_requests;create policy "leave own insert" on public.leave_requests for insert to authenticated with check(employee_id=auth.uid());
drop policy if exists "leave own draft update" on public.leave_requests;create policy "leave own draft update" on public.leave_requests for update to authenticated using((employee_id=auth.uid() and status='draft') or public.df_approval_is_admin()) with check((employee_id=auth.uid() and status in('draft','submitted')) or public.df_approval_is_admin());
drop policy if exists "leave ledger own read" on public.leave_ledger;create policy "leave ledger own read" on public.leave_ledger for select to authenticated using(employee_id=auth.uid() or public.df_approval_is_admin());
drop policy if exists "leave ledger admin write" on public.leave_ledger;create policy "leave ledger admin write" on public.leave_ledger for all to authenticated using(public.df_approval_is_admin()) with check(public.df_approval_is_admin());

create or replace function public.df_finalize_special_approval() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.quality_section_revisions; lr public.leave_requests; pname text; pteam text; d date;
begin
 if new.status='approved' and old.status is distinct from 'approved' then
   if new.quality_section_revision_id is not null then
     select * into r from public.quality_section_revisions where id=new.quality_section_revision_id for update;
     update public.quality_section_revisions set status='obsolete',updated_at=now() where section_id=r.section_id and status='active' and id<>r.id;
     update public.quality_section_revisions set status='active',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=r.id;
     update public.quality_manual_sections set current_revision=r.revision,updated_at=now() where id=r.section_id;
   end if;
   if new.leave_request_id is not null then
     select * into lr from public.leave_requests where id=new.leave_request_id for update;
     update public.leave_requests set status='approved',approval_document_id=new.id,updated_at=now() where id=lr.id;
     if lr.leave_type in ('annual','half_am','half_pm') then
       insert into public.leave_ledger(employee_id,leave_year,entry_type,days,note,leave_request_id,created_by)
         values(lr.employee_id,extract(year from lr.start_date)::int,'use',-lr.days,'연차휴가 결재 '||new.approval_no,lr.id,auth.uid()) on conflict(leave_request_id,entry_type) do nothing;
     end if;
     select name,team into pname,pteam from public.profiles where id=lr.employee_id;
     for d in select x::date from generate_series(lr.start_date,lr.end_date,'1 day') x where extract(isodow from x)<6 loop
       insert into public.schedules(schedule_date,status,schedule_type,employee,team,detail,memo,facilities,completed,extra_data)
       values(d,'confirmed','휴가/연차',pname,pteam,case lr.leave_type when 'half_am' then '오전 반차' when 'half_pm' then '오후 반차' when 'sick' then '병가' when 'special' then '특별휴가' else '연차휴가' end,lr.reason,'{}'::jsonb,false,jsonb_build_object('leave_request_id',lr.id,'approval_no',new.approval_no,'confirmed',true,'source','internal_approval'));
     end loop;
   end if;
 elsif new.status='rejected' and old.status is distinct from 'rejected' then
   if new.quality_section_revision_id is not null then update public.quality_section_revisions set status='rejected',updated_at=now() where id=new.quality_section_revision_id; end if;
   if new.leave_request_id is not null then update public.leave_requests set status='rejected',approval_document_id=new.id,updated_at=now() where id=new.leave_request_id; end if;
 end if;return new;
end $$;
drop trigger if exists df_finalize_special_approval_trigger on public.approval_documents;
create trigger df_finalize_special_approval_trigger after update of status on public.approval_documents for each row execute function public.df_finalize_special_approval();

create or replace function public.df_leave_balance(p_employee uuid,p_year integer)
returns table(granted numeric,used numeric,balance numeric) language sql stable security definer set search_path=public as $$
 select coalesce(sum(days) filter(where days>0),0),coalesce(-sum(days) filter(where days<0),0),coalesce(sum(days),0)
 from public.leave_ledger where employee_id=p_employee and leave_year=p_year and (p_employee=auth.uid() or public.df_approval_is_admin());
$$;
revoke all on function public.df_leave_balance(uuid,integer) from public,anon;grant execute on function public.df_leave_balance(uuid,integer) to authenticated;
