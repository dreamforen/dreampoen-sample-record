-- DREAMFOREN v120.37.4 ERP 비고 저장 보정
-- 기존 자료를 삭제하거나 변경하지 않고, 누락된 비고 열만 안전하게 추가합니다.

alter table public.erp_invoices add column if not exists note text default '';
alter table public.erp_payments add column if not exists note text default '';

notify pgrst, 'reload schema';
