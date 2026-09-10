-- DREAMFOREN v120.11 품질/LAB 문서와 게시판 권한 확장
alter table public.profiles
  add column if not exists board_permissions jsonb not null
  default '{"notice":true,"method":true,"board":true}'::jsonb;

create table if not exists public.quality_documents (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  doc_no text default '',
  title text not null,
  version text not null default '0',
  status text not null default 'active' check (status in ('active','draft','obsolete')),
  content text default '',
  file_name text,
  storage_path text,
  mime_type text,
  file_size bigint not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quality_documents_category_updated_idx
  on public.quality_documents(category, updated_at desc);
alter table public.quality_documents enable row level security;

drop policy if exists "quality documents authenticated read" on public.quality_documents;
create policy "quality documents authenticated read" on public.quality_documents
  for select to authenticated using (true);
drop policy if exists "quality documents admin insert" on public.quality_documents;
create policy "quality documents admin insert" on public.quality_documents
  for insert to authenticated with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));
drop policy if exists "quality documents admin update" on public.quality_documents;
create policy "quality documents admin update" on public.quality_documents
  for update to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));
drop policy if exists "quality documents admin delete" on public.quality_documents;
create policy "quality documents admin delete" on public.quality_documents
  for delete to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));

insert into storage.buckets (id,name,public,file_size_limit)
values ('quality-documents','quality-documents',false,52428800)
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit;

drop policy if exists "quality files authenticated read" on storage.objects;
create policy "quality files authenticated read" on storage.objects
  for select to authenticated using (bucket_id='quality-documents');
drop policy if exists "quality files admin insert" on storage.objects;
create policy "quality files admin insert" on storage.objects
  for insert to authenticated with check (bucket_id='quality-documents' and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));
drop policy if exists "quality files admin update" on storage.objects;
create policy "quality files admin update" on storage.objects
  for update to authenticated using (bucket_id='quality-documents' and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));
drop policy if exists "quality files admin delete" on storage.objects;
create policy "quality files admin delete" on storage.objects
  for delete to authenticated using (bucket_id='quality-documents' and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true));
