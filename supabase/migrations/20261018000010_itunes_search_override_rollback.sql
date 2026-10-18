-- 20261018000010_itunes_search_override 롤백 — itunes_search 정책 기록 행 제거. 멱등.
-- 이 행은 수집 소스가 아니어서 review_targets·analysis_inputs 가 가리키지 않는다(타깃 0 확인 뒤 DELETE). 하나라도 있으면 중단.
-- 호출 경로 자체의 비활성화는 이 롤백이 아니라 ITUNES_SEARCH_DISABLED=1(env) 또는 ITUNES_SEARCH_DAILY_MAX=0 이다.

BEGIN;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets WHERE source_key = 'itunes_search';
  IF n <> 0 THEN RAISE EXCEPTION 'itunes_search 를 가리키는 review_targets %개 — 롤백 중단(사람 판단)', n; END IF;
END $$;

DELETE FROM public.review_sources WHERE key = 'itunes_search' AND enabled = false AND override = 'owner_2026-10-18';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'itunes_search') THEN RAISE EXCEPTION '롤백 후에도 itunes_search 행이 남아 있다'; END IF;
END $$;

COMMIT;
