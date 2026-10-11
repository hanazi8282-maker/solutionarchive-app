-- 롤백: 20261012000010_review_source_ramp_cap_origin
-- (3) 하한 끌어올리기를 되돌린다: 그 마이그가 남긴 로그 사유 "상한 복구 A→B" 의 A 로, 지금 cap_base 가 여전히 B 인 행만
--     (그 뒤 엔진이 다시 바꿨으면 건드리지 않는다). daily_request_target 재계산, schedule_plan NULL.
-- (1) 칸·제약 제거(DROP COLUMN — 롤백 전용, 실행은 사람 판단). 코드는 칸이 없어도 돈다(lib/review/ramp.ts selectWithOptional).
-- review_source_ramp_log 는 지우지 않는다(감사 로그) — 롤백 사실을 1행씩 더 남긴다.

BEGIN;

WITH lifted AS (
  SELECT l.source_key,
         (substring(l.reason FROM '상한 복구 ([0-9]+)→'))::int AS before,
         (substring(l.reason FROM '상한 복구 [0-9]+→([0-9]+)'))::int AS after
    FROM public.review_source_ramp_log l
   WHERE l.applied_by = 'human-migration 20261012000010'
), logged AS (
  INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
  SELECT r.source_key, r.level, r.level, r.pct_step, r.pct_step, 'day',
         format('롤백 20261012000010 — 상한 %s→%s', f.after, f.before), 'human-migration 20261012000010 rollback'
    FROM public.review_source_ramp r JOIN lifted f USING (source_key)
   WHERE r.cap_base = f.after
  RETURNING source_key
)
UPDATE public.review_source_ramp r
   SET cap_base = f.before,
       daily_request_target = (f.before * r.pct_step) / 100,
       schedule_plan = NULL,
       reason = format('롤백 20261012000010 — 상한 %s→%s', f.after, f.before),
       changed_at = now()
  FROM lifted f
 WHERE r.source_key = f.source_key AND r.cap_base = f.after AND r.source_key IN (SELECT source_key FROM logged);

ALTER TABLE public.review_source_ramp DROP CONSTRAINT IF EXISTS review_source_ramp_cap_origin_check;
ALTER TABLE public.review_source_ramp DROP COLUMN IF EXISTS cap_base_origin;

COMMIT;

-- 확인: SELECT count(*) FROM information_schema.columns WHERE table_name='review_source_ramp' AND column_name='cap_base_origin';  -- 기대 0
