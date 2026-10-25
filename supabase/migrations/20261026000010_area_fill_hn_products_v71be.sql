-- ============================================================
-- 20261026000010_area_fill_hn_products_v71be
--
-- v71bd/v71be · 영역 ①~⑤ 안인데 area_code 가 NULL 이라 "쓸 수 있는 정보" 집계에서 빠지던 HN 제품 프로젝트 26개에 영역을 채운다.
-- 원인: 20261009000020 의 소급 부여는 1회성이고 "새 프로젝트는 재실행 전까지 NULL" 이다(무인 루프는 analysis_projects UPDATE 금지, §10.1).
--       그 뒤 등록된 HN 제품명 타깃 프로젝트(Fathom·Mailchimp·Pipedrive 등)가 NULL 로 남았다.
-- 범위: area_code IS NULL 인 행만, 아래 26개 제품(소개문 pitch 정확 일치)만. 영역 정의는 lib/analysis/area-reclass.ts RECLASS_INSTRUCTIONS 와 같다.
--       애매한 제품(Descript·Dovetail·Calendly·RescueTime·Harvest·Zapier·Airtable 등)과 노트류(Bear·Evernote·Apple Notes)는 일부러 NULL 로 둔다.
-- 비파괴: UPDATE 는 NULL → 값 한 방향. 기존 값 덮어쓰기 0. area_basis='manual' 이라 v37-1 롤백이 건드리지 않는다.
-- 롤백: 20261026000010_area_fill_hn_products_v71be_rollback.sql (area_rule_ver='v71be-1' 행만 NULL 로).
-- 4조건: 드라이런=이 PR 본문의 영역별 건수 · 롤백=위 파일 · 무중단=행 26개 UPDATE, 스키마 무변경 · 기록=Notion 일일 상태 로그 + docs/migration-exceptions.md
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

WITH m(name, area) AS (VALUES
  ('Fathom','1'),('Rev','1'),('Rewatch','1'),('Spinach','1'),('Grain','1'),('Fellow','1'),
  ('Pipedrive','2'),('Highrise','2'),('Streak','2'),('Mixmax','2'),
  ('Mailchimp','3'),('Buttondown','3'),('Unbounce','3'),('Fomo','3'),('Sumo','3'),('Gleam','3'),
  ('BambooHR','4'),('When I Work','4'),('Small Improvements','4'),('Lighthouse','4'),
  ('iA Writer','5'),('Ulysses','5'),('Scrivener','5'),('Lex','5'),('Draft','5'),('LanguageTool','5')
)
UPDATE public.analysis_projects p
   SET area_code = m.area,
       area_basis = 'manual',
       area_rule_ver = 'v71be-1',
       area_evidence = 'manual:v71be-1:' || lower(replace(m.name, ' ', '')),
       area_assigned_at = now()
  FROM m
 WHERE p.product_elevator_pitch = m.name
   AND p.area_code IS NULL;

-- 확인: 26행 이내(이미 부여된 행은 건드리지 않았다)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.analysis_projects WHERE area_rule_ver = 'v71be-1';
  IF n > 26 THEN RAISE EXCEPTION 'v71be-1 행이 26을 넘는다: %', n; END IF;
END $$;

COMMIT;
