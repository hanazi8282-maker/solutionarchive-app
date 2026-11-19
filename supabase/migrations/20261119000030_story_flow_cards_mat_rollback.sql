-- 롤백(v71cu 2-2): 사본과 인덱스만 지운다. 기존 뷰 story_flow_cards 는 건드리지 않는다 — 로더는 자동으로 기존 뷰로 폴백한다.
BEGIN;
DROP MATERIALIZED VIEW IF EXISTS public.story_flow_cards_mat;
COMMIT;
