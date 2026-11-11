-- 롤백: 추가한 인덱스만 지운다(기존 analysis_inputs_purgeable_idx 는 그대로).
BEGIN;
DROP INDEX IF EXISTS public.analysis_inputs_purgeable_nf_idx;
COMMIT;
