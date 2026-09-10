-- DREAMFOREN v120.17 DB 권한·영구저장 안정화
-- 기존 자료를 삭제하지 않으며 누락된 권한/정책만 다시 구성합니다.

grant usage on schema public to authenticated;

-- 계약 시설별 측정주기: 설치 여부와 접근권한을 함께 복구
grant select,insert,update,delete on table public.dreampoen_contract_facility_cycles to authenticated;
grant select,insert,update,delete on table public.dreampoen_migration_flags to authenticated;

alter table public.dreampoen_contract_facility_cycles enable row level security;
drop policy if exists "contract facility cycles authenticated read" on public.dreampoen_contract_facility_cycles;
create policy "contract facility cycles authenticated read" on public.dreampoen_contract_facility_cycles
for select to authenticated using (true);
drop policy if exists "contract facility cycles admin write" on public.dreampoen_contract_facility_cycles;
create policy "contract facility cycles admin write" on public.dreampoen_contract_facility_cycles
for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

alter table public.dreampoen_migration_flags enable row level security;
drop policy if exists "migration flags authenticated read" on public.dreampoen_migration_flags;
create policy "migration flags authenticated read" on public.dreampoen_migration_flags
for select to authenticated using (true);
drop policy if exists "migration flags admin write" on public.dreampoen_migration_flags;
create policy "migration flags admin write" on public.dreampoen_migration_flags
for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

-- 입찰자료: 화면 업데이트와 무관하게 DB에 계속 보관
grant select,insert,update,delete on table public.bid_records to authenticated;
alter table public.bid_records enable row level security;
drop policy if exists "bid records admin all" on public.bid_records;
create policy "bid records admin all" on public.bid_records
for all to authenticated using (public.dreampoen_is_admin()) with check (public.dreampoen_is_admin());

-- 청구·수금 테스트 시스템은 v120.20.1에서 제거되었습니다.

notify pgrst, 'reload schema';
