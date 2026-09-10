-- DREAMFOREN v120.28 내부 전자결재
-- Supabase SQL Editor에서 전체를 1회 실행합니다.

create sequence if not exists public.df_approval_no_seq start 1;

create table if not exists public.approval_documents (
  id uuid primary key default gen_random_uuid(),
  approval_no text not null unique default ('DF-AP-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.df_approval_no_seq')::text,5,'0')),
  doc_type text not null default 'general',
  title text not null,
  content text not null default '',
  status text not null default 'draft' check(status in ('draft','submitted','in_review','approved','rejected','cancelled')),
  requester_id uuid not null references public.profiles(id),
  current_step integer not null default 0,
  quality_document_id uuid references public.quality_documents(id) on delete set null,
  quality_revision text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  step_order integer not null check(step_order between 1 and 9),
  step_name text not null default '검토',
  approver_id uuid not null references public.profiles(id),
  status text not null default 'waiting' check(status in ('waiting','pending','approved','rejected','skipped')),
  opinion text not null default '',
  acted_at timestamptz,
  unique(document_id,step_order)
);

create table if not exists public.approval_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text default '',
  file_size bigint not null default 0,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.approval_audit_logs (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists approval_documents_requester_idx on public.approval_documents(requester_id,created_at desc);
create index if not exists approval_documents_status_idx on public.approval_documents(status,updated_at desc);
create index if not exists approval_steps_approver_idx on public.approval_steps(approver_id,status);
create index if not exists approval_steps_document_idx on public.approval_steps(document_id,step_order);

create or replace function public.df_approval_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and active=true and role='admin') $$;

create or replace function public.df_approval_can_read(p_document uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.df_approval_is_admin()
    or exists(select 1 from public.approval_documents d where d.id=p_document and d.requester_id=auth.uid())
    or exists(select 1 from public.approval_steps s where s.document_id=p_document and s.approver_id=auth.uid());
$$;

create or replace function public.df_approval_people()
returns table(id uuid,name text,email text,job_title text,team text,role text)
language sql stable security definer set search_path=public as $$
  select p.id,p.name,p.email,coalesce(p.job_title,''),coalesce(p.team,''),p.role
  from public.profiles p where p.active=true order by p.name;
$$;
revoke all on function public.df_approval_is_admin() from public,anon;
revoke all on function public.df_approval_can_read(uuid) from public,anon;
revoke all on function public.df_approval_people() from public,anon;
grant execute on function public.df_approval_is_admin() to authenticated;
grant execute on function public.df_approval_can_read(uuid) to authenticated;
grant execute on function public.df_approval_people() to authenticated;

alter table public.approval_documents enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_attachments enable row level security;
alter table public.approval_audit_logs enable row level security;

drop policy if exists "approval documents permitted read" on public.approval_documents;
create policy "approval documents permitted read" on public.approval_documents for select to authenticated
using (public.df_approval_can_read(id));
drop policy if exists "approval documents own insert" on public.approval_documents;
create policy "approval documents own insert" on public.approval_documents for insert to authenticated with check(requester_id=auth.uid());
drop policy if exists "approval documents draft update" on public.approval_documents;
create policy "approval documents draft update" on public.approval_documents for update to authenticated
using ((requester_id=auth.uid() and status='draft') or public.df_approval_is_admin())
with check ((requester_id=auth.uid() and status in ('draft','cancelled')) or public.df_approval_is_admin());

drop policy if exists "approval steps permitted read" on public.approval_steps;
create policy "approval steps permitted read" on public.approval_steps for select to authenticated using(public.df_approval_can_read(document_id));
drop policy if exists "approval steps requester insert" on public.approval_steps;
create policy "approval steps requester insert" on public.approval_steps for insert to authenticated
with check(exists(select 1 from public.approval_documents d where d.id=document_id and d.requester_id=auth.uid() and d.status='draft'));
drop policy if exists "approval steps requester delete" on public.approval_steps;
create policy "approval steps requester delete" on public.approval_steps for delete to authenticated
using(exists(select 1 from public.approval_documents d where d.id=document_id and d.requester_id=auth.uid() and d.status='draft'));

drop policy if exists "approval attachments permitted read" on public.approval_attachments;
create policy "approval attachments permitted read" on public.approval_attachments for select to authenticated using(public.df_approval_can_read(document_id));
drop policy if exists "approval attachments own insert" on public.approval_attachments;
create policy "approval attachments own insert" on public.approval_attachments for insert to authenticated
with check(uploaded_by=auth.uid() and exists(select 1 from public.approval_documents d where d.id=document_id and d.requester_id=auth.uid() and d.status='draft'));
drop policy if exists "approval attachments own delete" on public.approval_attachments;
create policy "approval attachments own delete" on public.approval_attachments for delete to authenticated
using(exists(select 1 from public.approval_documents d where d.id=document_id and d.requester_id=auth.uid() and d.status='draft'));

drop policy if exists "approval audit permitted read" on public.approval_audit_logs;
create policy "approval audit permitted read" on public.approval_audit_logs for select to authenticated using(public.df_approval_can_read(document_id));

grant select,insert,update on public.approval_documents to authenticated;
grant select,insert,delete on public.approval_steps to authenticated;
grant select,insert,delete on public.approval_attachments to authenticated;
grant select on public.approval_audit_logs to authenticated;
grant usage,select on sequence public.df_approval_no_seq to authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
values('approval-files','approval-files',false,20971520)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
drop policy if exists "approval files permitted read" on storage.objects;
create policy "approval files permitted read" on storage.objects for select to authenticated
using(bucket_id='approval-files' and public.df_approval_can_read((storage.foldername(name))[1]::uuid));
drop policy if exists "approval files own insert" on storage.objects;
create policy "approval files own insert" on storage.objects for insert to authenticated
with check(bucket_id='approval-files' and exists(select 1 from public.approval_documents d where d.id=(storage.foldername(name))[1]::uuid and d.requester_id=auth.uid() and d.status='draft'));
drop policy if exists "approval files own delete" on storage.objects;
create policy "approval files own delete" on storage.objects for delete to authenticated
using(bucket_id='approval-files' and exists(select 1 from public.approval_documents d where d.id=(storage.foldername(name))[1]::uuid and d.requester_id=auth.uid() and d.status='draft'));

create or replace function public.df_approval_submit(p_document uuid)
returns public.approval_documents language plpgsql security definer set search_path=public as $$
declare d public.approval_documents;
begin
  select * into d from public.approval_documents where id=p_document for update;
  if d.id is null or d.requester_id<>auth.uid() or d.status<>'draft' then raise exception '상신할 수 없는 문서입니다.'; end if;
  if not exists(select 1 from public.approval_steps where document_id=p_document) then raise exception '결재선을 지정해주세요.'; end if;
  update public.approval_steps set status=case when step_order=(select min(step_order) from public.approval_steps where document_id=p_document) then 'pending' else 'waiting' end,opinion='',acted_at=null where document_id=p_document;
  update public.approval_documents set status='submitted',current_step=(select min(step_order) from public.approval_steps where document_id=p_document),submitted_at=now(),updated_at=now() where id=p_document returning * into d;
  insert into public.approval_audit_logs(document_id,actor_id,action,detail) values(p_document,auth.uid(),'submitted',jsonb_build_object('approval_no',d.approval_no));
  return d;
end $$;

create or replace function public.df_approval_act(p_document uuid,p_action text,p_opinion text default '')
returns public.approval_documents language plpgsql security definer set search_path=public as $$
declare d public.approval_documents; s public.approval_steps; nxt integer; qrev text; qcontent jsonb; entry jsonb;
begin
  if p_action not in ('approve','reject') then raise exception '잘못된 처리입니다.'; end if;
  select * into d from public.approval_documents where id=p_document for update;
  select * into s from public.approval_steps where document_id=p_document and status='pending' order by step_order limit 1 for update;
  if d.id is null or s.id is null then raise exception '현재 처리할 결재단계가 없습니다.'; end if;
  if s.approver_id<>auth.uid() and not public.df_approval_is_admin() then raise exception '현재 결재자가 아닙니다.'; end if;
  if p_action='reject' then
    update public.approval_steps set status='rejected',opinion=coalesce(p_opinion,''),acted_at=now() where id=s.id;
    update public.approval_documents set status='rejected',completed_at=now(),updated_at=now() where id=p_document returning * into d;
    insert into public.approval_audit_logs(document_id,actor_id,action,detail) values(p_document,auth.uid(),'rejected',jsonb_build_object('step',s.step_order,'opinion',coalesce(p_opinion,'')));
    return d;
  end if;
  update public.approval_steps set status='approved',opinion=coalesce(p_opinion,''),acted_at=now() where id=s.id;
  select min(step_order) into nxt from public.approval_steps where document_id=p_document and status='waiting';
  if nxt is not null then
    update public.approval_steps set status='pending' where document_id=p_document and step_order=nxt;
    update public.approval_documents set status='in_review',current_step=nxt,updated_at=now() where id=p_document returning * into d;
  else
    update public.approval_documents set status='approved',current_step=s.step_order,completed_at=now(),updated_at=now() where id=p_document returning * into d;
    if d.quality_document_id is not null then
      select version,content::jsonb into qrev,qcontent from public.quality_documents where id=d.quality_document_id for update;
      entry=jsonb_build_object('revision',qrev,'date',to_char(current_date,'YYYY-MM-DD'),'scope','결재 승인 개정','reason',coalesce(qcontent#>>'{metadata,last_change_reason}','내부결재 승인'));
      qcontent=jsonb_set(qcontent #- '{metadata,working_revision}','{metadata,cover_revision}',to_jsonb(qrev),true);
      qcontent=jsonb_set(qcontent,'{metadata,effective_date}',to_jsonb(to_char(current_date,'YYYY-MM-DD')),true);
      qcontent=jsonb_set(qcontent,'{revision_history}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(qcontent->'revision_history','[]'::jsonb)) x where x->>'revision'<>qrev),'[]'::jsonb)||jsonb_build_array(entry),true);
      update public.quality_documents set status='obsolete',updated_at=now() where category='quality_manual' and doc_no='DFEN-QM-00' and status='active' and id<>d.quality_document_id;
      update public.quality_documents set status='active',content=qcontent::text,updated_by=auth.uid(),updated_at=now() where id=d.quality_document_id;
    end if;
  end if;
  insert into public.approval_audit_logs(document_id,actor_id,action,detail) values(p_document,auth.uid(),'approved',jsonb_build_object('step',s.step_order,'opinion',coalesce(p_opinion,''),'final',nxt is null));
  return d;
end $$;

revoke all on function public.df_approval_submit(uuid) from public,anon;
revoke all on function public.df_approval_act(uuid,text,text) from public,anon;
grant execute on function public.df_approval_submit(uuid) to authenticated;
grant execute on function public.df_approval_act(uuid,text,text) to authenticated;
