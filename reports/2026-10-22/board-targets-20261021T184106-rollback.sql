-- board-targets-20261021T184106-rollback — board-targets-20261021T184106 이 넣은 게시판 타깃만 지운다. 수집된 analysis_inputs·review_fingerprints 는 남는다(지우려면 scripts/review-purge.mjs).
-- 지우기 전에: SELECT source_key, product_ref, total_collected FROM public.review_targets WHERE (source_key, product_ref) IN (('clien', 'board:cm_iphonien'), ('clien', 'board:cm_mac'), ('clien', 'board:cm_app'), ('clien', 'board:cm_andro'), ('clien', 'board:cm_ai'), ('clien', 'board:cm_venture'));
BEGIN;
DELETE FROM public.review_targets
 WHERE (source_key, product_ref) IN (('clien', 'board:cm_iphonien'), ('clien', 'board:cm_mac'), ('clien', 'board:cm_app'), ('clien', 'board:cm_andro'), ('clien', 'board:cm_ai'), ('clien', 'board:cm_venture'));
COMMIT;
