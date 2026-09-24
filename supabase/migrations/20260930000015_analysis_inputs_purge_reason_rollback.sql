-- ============================================================
-- 20260930000015_analysis_inputs_purge_reason_rollback
--
-- purge_reason 컬럼을 지운다. purged_at·raw_text 는 건드리지 않는다.
-- 잃는 것: 이유 기록뿐. dedupe 분은 review_dedupe_soft_purges 에서 다시 백필할 수 있지만,
--   적용 후 30일 배치가 찍은 'retention' 은 purged_at IS NOT NULL AND raw_text IS NULL 로만 추정 가능하다.
-- 롤백 뒤 review-purge.mjs 는 PGRST204 경고를 내고 옛 패치로 폴백한다(중단 없음).
-- 확인: SELECT column_name FROM information_schema.columns
--        WHERE table_schema='public' AND table_name='analysis_inputs' AND column_name='purge_reason';  -- 0행
-- ============================================================

ALTER TABLE public.analysis_inputs DROP CONSTRAINT IF EXISTS analysis_inputs_purge_reason_check;
ALTER TABLE public.analysis_inputs DROP COLUMN IF EXISTS purge_reason;
