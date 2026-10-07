-- 롤백: 20261007000050_googleplay_cap100
-- googleplay daily_request_cap 100→60(현재값 100 가드), 램프 cap_base=60 · daily_request_target=30 · pct_step=50 · schedule_plan=NULL 복원.
-- consecutive_ok_days 는 0 으로 둔다(적용 전에도 0 이었다). 그사이 엔진이 올린 pct_step 은 50 으로 되돌아간다(의도 — 램프 재시작).
-- 차단 뒤 cap_base 가 낮아져 있으면 그 값을 유지한다(올리지 않음): 적용 뒤 차단이 나면 pctOnBlock 이 cap_base 를 floor(차단선×0.9)로 내리므로
--   가드를 cap_base=100 으로 두면 0행이 걸려 롤백이 가장 필요할 때 실패한다. 그래서 가드는 source_key 하나이고 cap_base=LEAST(cap_base,60) 이다.
-- review_source_ramp_log 는 지우지 않는다(감사 로그) — 롤백 사실을 event='start' 1행으로 더 남긴다.
-- 롤백 실행은 사람 판단.

BEGIN;

UPDATE public.review_sources SET daily_request_cap = 60 WHERE key = 'googleplay' AND daily_request_cap = 100;

INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
SELECT 'googleplay', level, level, pct_step, 50, 'start',
       '롤백 20261007000050 — 구글 플레이 cap_base 100→60(램프 50%=30건)', 'human-migration 20261007000050 rollback'
  FROM public.review_source_ramp WHERE source_key = 'googleplay';

UPDATE public.review_source_ramp
   SET cap_base = LEAST(cap_base, 60), daily_request_target = (LEAST(cap_base, 60) * 50) / 100 /* floor */, pct_step = 50, consecutive_ok_days = 0, schedule_plan = NULL,
       reason = '롤백 20261007000050 — 구글 플레이 cap_base 100→60(램프 50%=30건)', changed_at = now()
 WHERE source_key = 'googleplay';

DO $$
DECLARE c int; r public.review_source_ramp%ROWTYPE;
BEGIN
  SELECT daily_request_cap INTO c FROM public.review_sources WHERE key = 'googleplay';
  IF c IS DISTINCT FROM 60 THEN RAISE EXCEPTION 'googleplay daily_request_cap=%(기대 60)', c; END IF;
  SELECT * INTO r FROM public.review_source_ramp WHERE source_key = 'googleplay';
  IF r.cap_base IS NULL OR r.cap_base > 60 OR r.daily_request_target IS DISTINCT FROM (r.cap_base * 50) / 100 OR r.pct_step IS DISTINCT FROM 50 OR r.schedule_plan IS NOT NULL THEN
    RAISE EXCEPTION 'googleplay 램프 cap_base=% target=% pct_step=% plan_null=%(기대 cap_base<=60 / target=floor(cap_base*0.5) / 50 / true)', r.cap_base, r.daily_request_target, r.pct_step, (r.schedule_plan IS NULL);
  END IF;
END $$;

COMMIT;

-- 확인:
-- SELECT daily_request_cap FROM public.review_sources WHERE key = 'googleplay';                                  -- 기대: 60
-- SELECT cap_base, daily_request_target, pct_step, schedule_plan IS NULL FROM public.review_source_ramp WHERE source_key='googleplay';  -- 기대: ≤60 · floor(cap_base/2) · 50 · true
