-- ============================================================
-- 20260930000041_velog_board_targets — 롤백
--
-- 🟢 앞 마이그레이션이 넣은 타깃 4행을 지우고, 생산성 태그를 exhausted 로 되돌린다.
--    product_ref · competitor_url 리터럴로만 고른다 — 다른 타깃·프로젝트는 건드리지 않는다.
--
-- ⚠️ 수집된 리뷰는 남긴다(20260930000010 롤백과 같은 순서):
--    ① 타깃 먼저 지운다 → 더 수집되지 않는다.
--    ② 프로젝트는 리뷰 0건 · 타깃 0건일 때만 지운다(FK CASCADE 로 analysis_inputs 가 딸려 지워지는 것 방지).
--       리뷰가 있는 프로젝트 삭제는 "데이터 DELETE" 라 §10.2 사람 판단 예외다.
-- ⚠️ 생산성 되돌리기는 status='active' 인 그 1행만 exhausted 로 바꾼다. 적용 전에 이미 active 였다면
--    (누가 먼저 되살렸다면) 이 롤백이 그걸 닫는다 — 되돌리기 전에 아래 조회로 확인한다.
-- ⚠️ 코드(velog BOARDS 4개 · 게시판 문턱 30)는 되돌리지 않는다. 타깃이 없으면 그 경로는 아무 일도 안 한다.
--
-- 되돌리기 전에 남길 것:
--   SELECT t.product_ref, t.status, t.total_collected, t.last_run_at,
--          (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = t.project_id) AS inputs
--     FROM public.review_targets t WHERE t.source_key = 'velog' AND t.product_ref LIKE 'board:%';
-- ============================================================

BEGIN;

DELETE FROM public.review_targets
 WHERE source_key = 'velog'
   AND product_ref IN ('board:side-project', 'board:saas', 'board:startup', 'board:indie-hacker');

DELETE FROM public.analysis_projects p
 WHERE p.competitor_url IN ('https://velog.io/tags/사이드프로젝트', 'https://velog.io/tags/saas',
                            'https://velog.io/tags/스타트업', 'https://velog.io/tags/인디해커')
   AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id);

UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE source_key = 'velog'
   AND product_ref = 'board:productivity'
   AND status = 'active';

COMMIT;

-- 확인: velog 게시판 타깃은 board:productivity(exhausted) 1행만 남는다.
-- SELECT product_ref, status FROM public.review_targets WHERE source_key = 'velog' AND product_ref LIKE 'board:%';
