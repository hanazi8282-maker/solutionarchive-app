-- ============================================================
-- 20260930000043_devto_inflearn_yozm_board_targets — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 적용.
-- 🟢 앞 마이그레이션이 넣은 타깃 3행을 지우고, 리뷰·타깃이 0건인 프로젝트만 지운다(velog 000041 롤백과 같은 순서).
--    수집된 리뷰는 남긴다 — 리뷰가 있는 프로젝트 삭제는 데이터 DELETE 라 §10.2 사람 판단이다.
--
-- 되돌리기 전에 남길 것:
--   SELECT t.source_key, t.product_ref, t.status, t.total_collected,
--          (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = t.project_id) AS inputs
--     FROM public.review_targets t WHERE t.source_key IN ('devto', 'inflearn', 'yozm');
-- ============================================================

BEGIN;

DELETE FROM public.review_targets
 WHERE (source_key, product_ref) IN (('devto', 'board:saas'), ('inflearn', 'board:questions'), ('yozm', 'board:magazine'));

DELETE FROM public.analysis_projects p
 WHERE p.competitor_url IN ('https://dev.to/t/saas', 'https://www.inflearn.com/community/questions', 'https://yozm.wishket.com/magazine/')
   AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id);

COMMIT;

-- 확인: SELECT count(*) FROM public.review_targets WHERE source_key IN ('devto', 'inflearn', 'yozm');  -- 기대 0
