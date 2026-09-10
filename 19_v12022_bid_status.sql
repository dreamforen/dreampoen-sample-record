-- DREAMFOREN v120.22 입찰 진행상태 확장
alter table public.bid_records drop constraint if exists bid_records_status_check;
alter table public.bid_records add constraint bid_records_status_check
check(status in ('open','submitted','abandoned','won','lost'));
notify pgrst, 'reload schema';
