-- board-targets-20261021T184106
-- v71ba P0-3 드라이런(2026-10-22 KST 03:41, DB 없이 — 소스 행은 실측 사실 enabled=true 로, 기존 타깃은 리포 마이그의 board: ref 로 채웠다).
-- 선행: PR #591(클리앙 가벼운 글 페이지 파서) 머지. 그 전에 넣으면 글마다 실패 2·신규 0 이다.
-- 실측 글 속도(목록 1페이지 날짜, 60일 창): cm_iphonien 14.5 · cm_mac 1.5 · cm_app 1.45 · cm_andro 0.93 · cm_ai 0.26 · cm_venture 0.05 글/일.
-- include 목록은 config/discovery-c1.json 의 사람이 고른 6개(앱·AI·창업·OS 소모임) 그대로다.
-- ⛔ 미적용 초안 — scripts/board-discovery.mjs(자율 발굴 C-1 ①)가 만들었다. 적용은 오케스트레이터 판단(CLAUDE.md §10.2).
-- 무엇을: review_targets 6행 INSERT(board: 게시판 순회). UPDATE·DELETE·DDL 0. 롤백: board-targets-20261021T184106-rollback.sql
-- project_id = 그 소스의 기존 타깃이 가장 많은 프로젝트(동수면 uuid 순). 소스 타깃이 0이면 그 행은 0행 INSERT(조용한 끝 — 아래 확인 쿼리로 본다).
BEGIN;
WITH wanted(source_key, product_ref, label) AS (
  VALUES
    ('clien', 'board:cm_iphonien', 'clien cm_iphonien 게시판 순회(자율 발굴)'),  -- 목록 1페이지 새 글 19
    ('clien', 'board:cm_mac', 'clien cm_mac 게시판 순회(자율 발굴)'),  -- 목록 1페이지 새 글 19
    ('clien', 'board:cm_app', 'clien cm_app 게시판 순회(자율 발굴)'),  -- 목록 1페이지 새 글 19
    ('clien', 'board:cm_andro', 'clien cm_andro 게시판 순회(자율 발굴)'),  -- 목록 1페이지 새 글 19
    ('clien', 'board:cm_ai', 'clien cm_ai 게시판 순회(자율 발굴)'),  -- 목록 1페이지 새 글 19
    ('clien', 'board:cm_venture', 'clien cm_venture 게시판 순회(자율 발굴)')  -- 목록 1페이지 새 글 19
),
pick_project AS (
  SELECT DISTINCT ON (source_key) source_key, project_id
    FROM public.review_targets
   GROUP BY source_key, project_id
   ORDER BY source_key, count(*) DESC, project_id
)
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status)
SELECT p.project_id, w.source_key, w.product_ref, w.label, 'active'
  FROM wanted w JOIN pick_project p ON p.source_key = w.source_key
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = w.source_key AND t.product_ref = w.product_ref);
COMMIT;
-- 확인: SELECT source_key, product_ref, status, cursor FROM public.review_targets WHERE (source_key, product_ref) IN (('clien', 'board:cm_iphonien'), ('clien', 'board:cm_mac'), ('clien', 'board:cm_app'), ('clien', 'board:cm_andro'), ('clien', 'board:cm_ai'), ('clien', 'board:cm_venture'));  -- 기대 6행 active
