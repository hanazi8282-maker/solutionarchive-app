-- 롤백(붙여넣기용): 새 칸·색인만 지운다. 원본 sub_topic 등 기존 칸은 건드리지 않는다.
-- 먼저 20261120000020_outcome_pairs_matched_v2_rollback.sql 을 돌린다(v2 함수가 이 칸을 읽는다 — plpgsql 본문은 의존성으로 잡히지 않아 이 롤백은 성공하지만 v2 함수가 그다음 호출에서 실패한다).
-- 주의: sub_topic_norm 값(LLM 분류 결과)은 지우면 다시 돌려야 한다(스크립트로 재생성 가능, 원본 손실은 없다).
BEGIN;
DROP INDEX IF EXISTS public.ss_episode_tags_subnorm_idx;
ALTER TABLE public.ss_episode_tags DROP COLUMN IF EXISTS sub_topic_norm_run;
ALTER TABLE public.ss_episode_tags DROP COLUMN IF EXISTS sub_topic_norm;
COMMIT;
