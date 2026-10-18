-- 20261019000030_stackexchange_enable 롤백 — Stack Exchange 를 다시 끄고 타깃을 멈춘다. 멱등. DELETE 없음(수집분이 타깃을 가리킨다).

BEGIN;

UPDATE public.review_targets SET status = 'exhausted'
 WHERE source_key = 'stackexchange' AND status = 'active';

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261019000030 롤백 — Stack Exchange 소스 중단(하루 0.2건대라 값어치 없음)',
       disabled_at = now()
 WHERE key = 'stackexchange';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE key = 'stackexchange' AND enabled;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 켜져 있는 행 %', n; END IF;
END $$;

COMMIT;
