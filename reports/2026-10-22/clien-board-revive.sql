-- clien-board-revive — v71ba P0-3. ⛔ 미적용 초안(서브에이전트가 만들었다). 적용은 오케스트레이터 판단(CLAUDE.md §10.1 재방문 시계와 같은 두 칸·같은 방향).
-- 선행: PR #591(클리앙 가벼운 글 페이지 파서) 머지. 머지 전에 열면 글마다 실패 2·신규 0 으로 다시 닫힌다.
-- 왜 수동인가: 파서가 깨진 동안 total_collected 가 늘지 않아 재방문 시계의 기대 신규(λ×경과일)가 1 미만 → expected_low 로 영영 안 열린다.
-- 무엇을: clien 의 기존 board: 타깃(use·jirum, 마이그 20260930000008~10)을 exhausted → active, consecutive_empty 0. 두 칸만. INSERT·DELETE·DDL 0.
-- 먼저 보기: SELECT id, product_ref, status, consecutive_empty, total_collected, last_run_at FROM public.review_targets WHERE source_key = 'clien' AND product_ref LIKE 'board:%';
-- 롤백: clien-board-revive-rollback.sql(적용 전에 위 SELECT 결과로 id·이전 값을 채워 둔다 — 아래 UPDATE 는 exhausted 인 행만 바꾼다).
BEGIN;
UPDATE public.review_targets
   SET status = 'active', consecutive_empty = 0
 WHERE source_key = 'clien' AND product_ref IN ('board:use', 'board:jirum') AND status = 'exhausted';
COMMIT;
-- 확인: SELECT product_ref, status, consecutive_empty FROM public.review_targets WHERE source_key = 'clien' AND product_ref IN ('board:use', 'board:jirum');  -- 기대 active · 0
