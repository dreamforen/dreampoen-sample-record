-- DREAMFOREN v120.24 profile + dashboard attachments
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.dreampoen_dashboard_posts add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets(id,name,public,file_size_limit)
values('dashboard-attachments','dashboard-attachments',false,20971520)
on conflict(id) do update set public=false,file_size_limit=20971520;

drop policy if exists "dashboard attachments authenticated read" on storage.objects;
create policy "dashboard attachments authenticated read" on storage.objects for select to authenticated
using(bucket_id='dashboard-attachments');
drop policy if exists "dashboard attachments authenticated insert" on storage.objects;
create policy "dashboard attachments authenticated insert" on storage.objects for insert to authenticated
with check(bucket_id='dashboard-attachments' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "dashboard attachments owner delete" on storage.objects;
create policy "dashboard attachments owner delete" on storage.objects for delete to authenticated
using(bucket_id='dashboard-attachments' and ((storage.foldername(name))[1]=auth.uid()::text or public.dreampoen_is_admin()));

grant select on public.profiles to authenticated;
grant update(name,email,phone,job_title) on public.profiles to authenticated;
grant select,insert,update,delete on public.dreampoen_dashboard_posts to authenticated;

create or replace function public.dreampoen_protect_job_title() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.job_title is distinct from old.job_title and not public.dreampoen_is_admin() then
    raise exception '직급은 관리자만 변경할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_job_title on public.profiles;
create trigger protect_profile_job_title before update on public.profiles for each row execute function public.dreampoen_protect_job_title();
