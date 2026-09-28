-- 롤백: 20260930000026_review_sources_disquiet.sql
-- ⛔ 서브에이전트·무인 루프는 실행하지 않는다. §10.2 주체가 적용한다.
--
-- 정방향은 소스 행 1개 + 타깃 행 1개 INSERT 뿐이다.
-- 한 번이라도 수집했다면 DELETE 대신 kill-switch(UPDATE)만 쓴다 — 자식 행을 지우는 것은 데이터 삭제라 사람 판단이다.

-- 1) 자식 행 확인 (fingerprints·inputs 가 0 이어야 DELETE 가능):
--   select (select count(*) from public.review_targets      where source_key = 'disquiet') as targets,
--          (select count(*) from public.review_fingerprints where source_key = 'disquiet') as fingerprints,
--          (select count(*) from public.analysis_inputs     where source_key = 'disquiet') as inputs;

-- 2) kill-switch — 항상 안전하다.
UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: 디스콰이엇 소스 철회', disabled_at = now()
 WHERE key = 'disquiet';

-- 3) 수집 0건(fingerprints·inputs 0)을 확인했을 때만:
--   DELETE FROM public.review_targets WHERE source_key = 'disquiet' AND product_ref = 'board:feed';
--   DELETE FROM public.review_sources WHERE key = 'disquiet';
