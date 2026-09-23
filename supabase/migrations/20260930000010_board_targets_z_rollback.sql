-- ============================================================
-- 20260930000010_board_targets_z — 롤백
--
-- 🟢 앞 마이그레이션이 넣은 **그 2행만** 지운다. `product_ref` 와
--    `competitor_url` 리터럴로 골라내므로 다른 타깃·프로젝트를 건드리지 않는다.
--
-- ⚠️ **수집된 리뷰는 남는다.** `analysis_projects` 를 지우면 FK CASCADE 로
--    `analysis_inputs` 까지 딸려 지워지므로, 그 프로젝트에 이미 리뷰가 들어왔으면
--    이 롤백은 **데이터 삭제**가 된다. 그래서 순서를 이렇게 둔다:
--      ① 타깃만 먼저 지운다 → 그 이상 수집되지 않는다(되돌림의 실질은 여기까지다).
--      ② 프로젝트는 **리뷰가 0건일 때만** 지운다. 1건이라도 있으면 남긴다.
--    프로젝트를 정말 지우려면 그건 "데이터 DELETE" 라 §10.2 의 사람 판단 예외다 —
--    세션이 스스로 하지 않는다.
--
-- ⚠️ 코드 쪽(velog `board:productivity` 지원 · 댓글 확장)은 이 파일이 되돌리지 않는다.
--    되돌릴 필요도 없다 — 등록된 `board:` 타깃이 없으면 그 경로는 아무 일도 안 한다.
--
-- ⚠️ product_ref 컬럼 주석은 되돌리지 않는다. 주석을 앞 버전으로 덮어쓰면
--    "velog 댓글 확장"·"damoang 좁힘" 같은 **지금 코드의 사실**이 사라진다.
--    (주석은 제약이 아니라 설명이고, 틀린 설명이 없는 설명보다 나쁘다.)
--
-- 되돌리기 전에 무엇이 모였는지 남길 것:
--   SELECT t.product_ref, t.status, t.cursor, t.total_collected, t.last_run_at,
--          (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = t.project_id) AS inputs
--     FROM public.review_targets t
--    WHERE t.source_key = 'velog' AND t.product_ref LIKE 'board:%';
-- ============================================================

BEGIN;

-- ① 타깃 제거 — 더 수집되지 않는다.
DELETE FROM public.review_targets
 WHERE source_key = 'velog'
   AND product_ref = 'board:productivity';

-- ② 프로젝트는 리뷰가 0건일 때만. 1건이라도 있으면 남긴다(CASCADE 삭제 방지).
DELETE FROM public.analysis_projects p
 WHERE p.competitor_url = 'https://velog.io/tags/생산성'
   AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id);

COMMIT;

-- 확인
-- 양성: 게시판 타깃이 0건이다.
-- ⚠️ source_key 로 좁힌다 — okky 의 board:community(20260930000009)는 이 롤백과 무관하다.
-- SELECT count(*) FROM public.review_targets
--  WHERE source_key = 'velog' AND product_ref LIKE 'board:%';   -- 기대: 0
--
-- 리뷰가 남아 있으면 프로젝트도 남는다. 그게 정상이다 — 눈으로 확인한다.
-- SELECT p.id, p.competitor_url,
--        (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = p.id) AS inputs
--   FROM public.analysis_projects p WHERE p.competitor_url = 'https://velog.io/tags/생산성';
