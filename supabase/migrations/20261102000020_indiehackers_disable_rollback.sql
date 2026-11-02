-- 20261102000020_indiehackers_disable 롤백 — 이 마이그가 끈 경우에만 다시 켠다. 멱등. DELETE 없음.

BEGIN;

UPDATE public.review_sources
   SET enabled = true, disabled_reason = NULL, disabled_at = NULL
 WHERE key = 'indiehackers' AND NOT enabled AND disabled_reason LIKE '20261102000020%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE disabled_reason LIKE '20261102000020%') THEN
    RAISE EXCEPTION '롤백 후에도 이 마이그 사유가 남아 있다';
  END IF;
END $$;

COMMIT;
