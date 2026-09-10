-- DREAMFOREN v120.30 · 관리자 결재문서 안전삭제
-- 22_v12028_internal_approval.sql 및 23_v12029_quality_sections_leave.sql 실행 후 1회 실행합니다.

alter table public.approval_documents add column if not exists deleted_at timestamptz;
alter table public.approval_documents add column if not exists deleted_by uuid references public.profiles(id);
alter table public.approval_documents add column if not exists delete_reason text not null default '';
create index if not exists approval_documents_deleted_idx on public.approval_documents(deleted_at,created_at desc);

create or replace function public.df_approval_admin_delete(p_document uuid,p_reason text default '')
returns boolean language plpgsql security definer set search_path=public as $$
declare d public.approval_documents; lr public.leave_requests;
begin
  if not public.df_approval_is_admin() then raise exception '관리자만 결재문서를 삭제할 수 있습니다.'; end if;
  select * into d from public.approval_documents where id=p_document and deleted_at is null for update;
  if d.id is null then raise exception '삭제할 결재문서를 찾을 수 없습니다.'; end if;

  insert into public.approval_audit_logs(document_id,actor_id,action,detail)
  values(d.id,auth.uid(),'admin_deleted',jsonb_build_object('reason',coalesce(p_reason,''),'previous_status',d.status));

  if d.leave_request_id is not null then
    select * into lr from public.leave_requests where id=d.leave_request_id for update;
    delete from public.schedules where extra_data->>'leave_request_id'=lr.id::text;
    if lr.status='approved' and lr.leave_type in ('annual','half_am','half_pm') then
      insert into public.leave_ledger(employee_id,leave_year,entry_type,days,note,leave_request_id,created_by)
      values(lr.employee_id,extract(year from lr.start_date)::int,'cancel',lr.days,'관리자 결재 삭제에 따른 연차 복원',lr.id,auth.uid())
      on conflict(leave_request_id,entry_type) do nothing;
    end if;
    update public.leave_requests set status='cancelled',updated_at=now() where id=lr.id;
  end if;

  update public.approval_documents set deleted_at=now(),deleted_by=auth.uid(),delete_reason=coalesce(p_reason,''),updated_at=now() where id=d.id;
  return true;
end $$;

revoke all on function public.df_approval_admin_delete(uuid,text) from public,anon;
grant execute on function public.df_approval_admin_delete(uuid,text) to authenticated;
