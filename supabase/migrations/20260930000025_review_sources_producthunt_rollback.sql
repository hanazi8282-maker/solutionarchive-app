-- 롤백: 20260930000025_review_sources_producthunt.sql
-- ⛔ 서브에이전트·무인 루프는 실행하지 않는다. §10.2 주체가 적용한다.
--
-- 정방향은 행 1개 INSERT 뿐이다. 켠 적이 없으면(수집 0건) 자식 행이 없으므로 아래 DELETE 로 완전히 되돌아간다.
-- 한 번이라도 켜서 수집했다면 DELETE 대신 kill-switch(UPDATE)만 쓴다 — 자식 행을 지우는 것은 데이터 삭제라 사람 판단이다.

-- 1) 먼저 자식 행이 있는지 본다 (모두 0 이어야 DELETE 가능):
--   select (select count(*) from public.review_targets      where source_key = 'producthunt') as targets,
--          (select count(*) from public.review_fingerprints where source_key = 'producthunt') as fingerprints,
--          (select count(*) from public.analysis_inputs     where source_key = 'producthunt') as inputs;

-- 2) kill-switch — 항상 안전하다.
UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: Product Hunt 소스 철회'
 WHERE key = 'producthunt';

-- 3) 자식 행 0 을 확인했을 때만:
--   DELETE FROM public.review_sources WHERE key = 'producthunt';
