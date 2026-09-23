-- ============================================================
-- 롤백 — 20260930000008_board_targets_x.sql
--
-- 그 마이그레이션이 넣은 게시판 타깃 6개만 지운다. 그 소스의 다른 타깃
-- (`url:` 형식 29개, 2026-09-23 실측)은 건드리지 않는다.
--
-- ⚠️ 이 DELETE 는 **타깃 행만** 지운다. 이미 수집된 `analysis_inputs` 와
--    `review_fingerprints` 는 남는다 — 그게 맞다. 수집한 VOC 를 지우는 것은
--    "타깃 등록을 되돌리는 것"과 다른 사건이고, 지문을 지우면 다시 등록했을 때
--    같은 글이 새 행으로 또 적재된다. 수집분까지 지워야 하면
--    scripts/review-purge.mjs 를 쓴다(거기가 그 경로다).
--
-- ⚠️ 게시판 타깃이 한 번이라도 돌았으면 `total_collected` 가 0 이 아닐 수 있다.
--    지우기 전에 아래 쿼리로 무엇을 지우는지 먼저 봐라.
--
-- SELECT source_key, product_ref, status, total_collected, last_run_at
--   FROM public.review_targets
--  WHERE product_ref IN ('board:use','board:jirum','board:31','board:7','board:battle','board:national')
--  ORDER BY source_key, product_ref;
-- ============================================================

BEGIN;

DELETE FROM public.review_targets
 WHERE source_key IN ('clien', '82cook', 'bobaedream')
   AND product_ref IN ('board:use', 'board:jirum', 'board:31', 'board:7', 'board:battle', 'board:national');

COMMIT;

-- ── 확인 ─────────────────────────────────────────────────────
-- 양성: 게시판 타깃이 0행이다.
-- SELECT count(*) FROM public.review_targets WHERE product_ref LIKE 'board:%';   -- 기대: 0
--
-- 음성: url: 타깃은 그대로다.
-- SELECT source_key, count(*) FROM public.review_targets
--  WHERE source_key IN ('clien','82cook','bobaedream') AND product_ref LIKE 'url:%'
--  GROUP BY source_key;      -- 기대: clien 19 · 82cook 7 · bobaedream 3 (2026-09-23 실측)
