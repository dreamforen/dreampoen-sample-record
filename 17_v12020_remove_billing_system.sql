-- DREAMFOREN v120.20 청구·수금 테스트 시스템 완전 제거
-- 실행 대상: Supabase SQL Editor
--
-- 삭제되는 내용
--   1) contracts.extra_data 안의 billing 키(세금계산서·입금·미수금 연결값)
--   2) billing_import_items 테이블 전체(업로드 원본, 처리상태, 계약 연결값 포함)
--
-- 보존되는 내용
--   contracts 계약 행과 계약 기본정보
--   companies 업체현황 행과 업체 기본정보
--   계약·업체 연락처, 시설, 측정주기, 일정, 시료채취 및 LAB 자료

begin;

do $$
declare
  linked_contracts integer := 0;
  imported_items integer := 0;
begin
  select count(*) into linked_contracts
  from public.contracts
  where coalesce(extra_data, '{}'::jsonb) ? 'billing';

  if to_regclass('public.billing_import_items') is not null then
    execute 'select count(*) from public.billing_import_items' into imported_items;
  end if;

  raise notice '청구·수금 연결 계약: %건', linked_contracts;
  raise notice '업로드 원본: %건', imported_items;
end $$;

-- 계약 행은 유지하고 청구·수금 기능이 추가한 billing 값만 제거한다.
update public.contracts
set extra_data = coalesce(extra_data, '{}'::jsonb) - 'billing'
where coalesce(extra_data, '{}'::jsonb) ? 'billing';

-- 청구·수금 전용 업로드 DB와 관련 인덱스·정책·외래키를 함께 제거한다.
drop table if exists public.billing_import_items cascade;

commit;

-- 실행 후 검증 결과는 모두 0이어야 한다.
select count(*) as contracts_with_billing_data
from public.contracts
where coalesce(extra_data, '{}'::jsonb) ? 'billing';

select to_regclass('public.billing_import_items') as billing_import_table;
