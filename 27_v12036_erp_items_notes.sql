-- DREAMFOREN v120.36 ERP 항목 추가·삭제·비고 지원
-- 독립 ERP 테이블만 변경하며 계약관리·업체현황에는 영향을 주지 않습니다.
alter table public.erp_invoices add column if not exists note text default '';
alter table public.erp_payments add column if not exists note text default '';
notify pgrst, 'reload schema';
