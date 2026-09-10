-- DREAMFOREN v120.31.1 결재상신 RLS 보정
-- 기존 결재문서·결재선·품질문서·연차자료는 삭제하지 않습니다.

create or replace function public.df_approval_create_draft(
  p_title text,
  p_content text,
  p_doc_type text,
  p_quality_document_id uuid default null,
  p_quality_revision text default null,
  p_quality_section_revision_id uuid default null,
  p_leave_request_id uuid default null
)
returns public.approval_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  result public.approval_documents;
begin
  if uid is null then
    raise exception '로그인 세션을 확인해주세요.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=uid and p.active=true) then
    raise exception '승인된 사용자가 아닙니다.';
  end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then
    raise exception '제목을 입력해주세요.';
  end if;

  insert into public.approval_documents(
    title,content,doc_type,requester_id,quality_document_id,quality_revision,
    quality_section_revision_id,leave_request_id
  ) values (
    btrim(p_title),coalesce(p_content,''),coalesce(nullif(p_doc_type,''),'general'),uid,
    p_quality_document_id,p_quality_revision,p_quality_section_revision_id,p_leave_request_id
  ) returning * into result;
  return result;
end
$$;

revoke all on function public.df_approval_create_draft(text,text,text,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.df_approval_create_draft(text,text,text,uuid,text,uuid,uuid) to authenticated;

-- 직접 저장 방식도 로그인 세션과 기안자가 일치할 때 계속 허용합니다.
drop policy if exists "approval documents own insert" on public.approval_documents;
create policy "approval documents own insert" on public.approval_documents
for insert to authenticated
with check (
  auth.uid() is not null
  and requester_id=auth.uid()
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true)
);
