-- 롤백(붙여넣기용, 남헌이 SQL Editor 에서): 새 뷰·새 칸만 지운다. 기존 데이터는 건드리지 않는다.
BEGIN;
DROP VIEW IF EXISTS public.outcome_pairs_norm;
DROP INDEX IF EXISTS public.ss_episode_tags_mechnorm_idx;
ALTER TABLE public.ss_episode_tags DROP COLUMN IF EXISTS mechanism_norm_run;
ALTER TABLE public.ss_episode_tags DROP COLUMN IF EXISTS mechanism_norm;
COMMIT;
