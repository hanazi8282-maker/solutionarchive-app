-- v71cu 2-2: story_flow_cards 가 statement timeout 에 걸리지 않게 미리 계산한 사본(materialized view)과 인덱스. 추가 전용.
-- 기존 뷰 story_flow_cards 는 그대로 둔다. 로더(lib/consult/story-flow.ts fetchFlowCards)는 이 사본을 먼저 읽고, 없거나 오류면 기존 뷰로 폴백한다.
-- created_at = 스토리 꼬리표를 단 시각(ss_story_labels.created_at) — 점수식의 최신성(0.05) 칸이 쓴다(원 게시일이 DB 에 없어 대용).
-- 새로 고침(꼬리표 회차를 적재한 뒤마다 1회): REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;
--   ponytail: 고유 인덱스가 없어 CONCURRENTLY 는 못 쓴다(새로 고치는 동안 읽기가 기다린다). 동시 읽기가 문제되면 (source_key,slug,label_run,chapter) 중복 0건 확인 후 고유 인덱스 추가.
-- 접근: service_role 전용(materialized view 는 RLS 가 없으므로 anon·authenticated 권한을 뺀다).
BEGIN;
SET LOCAL statement_timeout = '10min';

CREATE MATERIALIZED VIEW IF NOT EXISTS public.story_flow_cards_mat AS
SELECT c.*, s.created_at
FROM public.story_flow_cards c
JOIN public.ss_story_labels s
  ON s.source_key = c.source_key AND s.slug = c.slug AND s.label_run = c.label_run
WITH DATA;

CREATE INDEX IF NOT EXISTS story_flow_cards_mat_chapter_weight_idx ON public.story_flow_cards_mat (chapter, weight);
CREATE INDEX IF NOT EXISTS story_flow_cards_mat_slug_idx ON public.story_flow_cards_mat (slug);

REVOKE ALL ON public.story_flow_cards_mat FROM anon, authenticated;
COMMIT;
-- 확인(양성): SELECT to_regclass('public.story_flow_cards_mat') IS NOT NULL;
--            SELECT (SELECT count(*) FROM public.story_flow_cards_mat) = (SELECT count(*) FROM public.story_flow_cards);
--            EXPLAIN SELECT * FROM public.story_flow_cards_mat WHERE chapter = 5 AND weight >= 30;  -- Index/Bitmap Scan 이면 정상
-- 음성:      SELECT has_table_privilege('anon','public.story_flow_cards_mat','SELECT') = false;
