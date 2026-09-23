-- DREAMFOREN v120.37.18.1 품질매뉴얼 문서형 편집기 기준 개정번호 정리
-- 23_v12029_quality_sections_leave.sql 실행 후 1회 실행합니다.

alter table public.quality_manual_sections
  alter column current_revision set default '03';

-- 장별 승인본이 아직 없는 초기 자료만 기준 개정번호를 Rev.03으로 맞춥니다.
-- 이미 결재·승인된 장별 개정번호는 변경하지 않습니다.
update public.quality_manual_sections s
set current_revision='03', updated_at=now()
where coalesce(nullif(regexp_replace(s.current_revision,'[^0-9]','','g'),''),'0')::integer < 3
  and not exists (
    select 1 from public.quality_section_revisions r
    where r.section_id=s.id and r.status='active'
  );
