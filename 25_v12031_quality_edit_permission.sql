-- DREAMFOREN v120.31 품질문서 열람/수정 권한 분리
-- 기존 문서와 개정이력은 삭제하거나 초기화하지 않습니다.

alter table public.profiles
  add column if not exists access_permissions jsonb not null default '{}'::jsonb;

create or replace function public.dreampoen_can_edit_quality()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.active=true
      and (
        p.role='admin'
        or coalesce((p.access_permissions->>'quality_edit')::boolean,false)=true
      )
  )
$$;
revoke all on function public.dreampoen_can_edit_quality() from public;
grant execute on function public.dreampoen_can_edit_quality() to authenticated;

drop policy if exists "quality documents admin insert" on public.quality_documents;
drop policy if exists "quality documents admin update" on public.quality_documents;
drop policy if exists "quality documents admin delete" on public.quality_documents;
create policy "quality documents admin insert" on public.quality_documents for insert to authenticated
  with check (public.dreampoen_can_edit_quality());
create policy "quality documents admin update" on public.quality_documents for update to authenticated
  using (public.dreampoen_can_edit_quality()) with check (public.dreampoen_can_edit_quality());
create policy "quality documents admin delete" on public.quality_documents for delete to authenticated
  using (public.dreampoen_can_edit_quality());

drop policy if exists "quality files admin insert" on storage.objects;
drop policy if exists "quality files admin update" on storage.objects;
drop policy if exists "quality files admin delete" on storage.objects;
create policy "quality files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id='quality-documents' and public.dreampoen_can_edit_quality());
create policy "quality files admin update" on storage.objects for update to authenticated
  using (bucket_id='quality-documents' and public.dreampoen_can_edit_quality())
  with check (bucket_id='quality-documents' and public.dreampoen_can_edit_quality());
create policy "quality files admin delete" on storage.objects for delete to authenticated
  using (bucket_id='quality-documents' and public.dreampoen_can_edit_quality());

drop policy if exists "qms sections admin" on public.quality_manual_sections;
create policy "qms sections admin" on public.quality_manual_sections for all to authenticated
  using (public.dreampoen_can_edit_quality()) with check (public.dreampoen_can_edit_quality());
drop policy if exists "qms revisions admin" on public.quality_section_revisions;
create policy "qms revisions admin" on public.quality_section_revisions for all to authenticated
  using (public.dreampoen_can_edit_quality()) with check (public.dreampoen_can_edit_quality());
