-- ============================================================
-- 20260930000044_indiehackers_interviews — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트·무인 루프는 실행하지 않는다.
-- 🟢 타깃 1행을 지우고, 리뷰·타깃이 0건인 프로젝트만 지우고, 소스는 kill-switch(UPDATE)로 끈다.
--    수집된 리뷰는 남긴다. 소스 행 DELETE 는 수집 0건일 때만(아래 3) — 자식 행 삭제는 §10.2 사람 판단이다.
--
-- 되돌리기 전에 남길 것:
--   SELECT t.product_ref, t.status, t.total_collected,
--          (SELECT count(*) FROM public.review_fingerprints f WHERE f.source_key = 'indiehackers') AS fingerprints,
--          (SELECT count(*) FROM public.analysis_inputs     i WHERE i.source_key = 'indiehackers') AS inputs
--     FROM public.review_targets t WHERE t.source_key = 'indiehackers';
-- ============================================================

BEGIN;

DELETE FROM public.review_targets WHERE source_key = 'indiehackers' AND product_ref = 'board:stories';

DELETE FROM public.analysis_projects p
 WHERE p.competitor_url = 'https://www.indiehackers.com/stories'
   AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id);

UPDATE public.review_sources
   SET enabled = false, disabled_reason = '롤백: 2026-09-30 Indie Hackers 편집 인터뷰 철회', disabled_at = now()
 WHERE key = 'indiehackers';

COMMIT;

-- 3) 수집 0건(fingerprints·inputs 0)·타깃 0건을 확인했을 때만:
--   DELETE FROM public.review_sources WHERE key = 'indiehackers';
-- 확인: SELECT count(*) FROM public.review_targets WHERE source_key = 'indiehackers';  -- 기대 0
