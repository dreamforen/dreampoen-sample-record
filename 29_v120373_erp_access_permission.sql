-- DREAMFOREN v120.37.3 ERP 직원별 접근권한
-- 기존 ERP 자료는 변경하거나 삭제하지 않습니다.
-- 관리자 또는 profiles.access_permissions.billing=true 인 활성 계정만 접근합니다.

create or replace function public.dreampoen_can_erp()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles
    where id=auth.uid()
      and active=true
      and (
        role='admin'
        or coalesce(access_permissions->>'billing','false')='true'
      )
  )
$$;

revoke all on function public.dreampoen_can_erp() from public;
grant execute on function public.dreampoen_can_erp() to authenticated;

alter table public.erp_customers enable row level security;
alter table public.erp_invoices enable row level security;
alter table public.erp_payments enable row level security;
alter table public.erp_customer_aliases enable row level security;

grant select,insert,update,delete on
  public.erp_customers,
  public.erp_invoices,
  public.erp_payments,
  public.erp_customer_aliases
to authenticated;

drop policy if exists "erp admin all" on public.erp_customers;
drop policy if exists "erp admin all" on public.erp_invoices;
drop policy if exists "erp admin all" on public.erp_payments;
drop policy if exists "erp admin all" on public.erp_customer_aliases;

drop policy if exists "erp authorized all" on public.erp_customers;
drop policy if exists "erp authorized all" on public.erp_invoices;
drop policy if exists "erp authorized all" on public.erp_payments;
drop policy if exists "erp authorized all" on public.erp_customer_aliases;

create policy "erp authorized all" on public.erp_customers
for all to authenticated
using (public.dreampoen_can_erp())
with check (public.dreampoen_can_erp());

create policy "erp authorized all" on public.erp_invoices
for all to authenticated
using (public.dreampoen_can_erp())
with check (public.dreampoen_can_erp());

create policy "erp authorized all" on public.erp_payments
for all to authenticated
using (public.dreampoen_can_erp())
with check (public.dreampoen_can_erp());

create policy "erp authorized all" on public.erp_customer_aliases
for all to authenticated
using (public.dreampoen_can_erp())
with check (public.dreampoen_can_erp());

notify pgrst, 'reload schema';
