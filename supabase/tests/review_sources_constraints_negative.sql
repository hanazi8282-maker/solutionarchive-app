-- 000001·000003 제약이 실제로 막는지 음성 검사. 데이터를 바꾸지 않는다:
-- 각 DO 블록은 위반 UPDATE 를 시도하고, check_violation 이 나면 통과(조용히 종료),
-- 막히지 않으면 EXCEPTION 'NOT_BLOCKED:…' 으로 스크립트가 실패한다(그 문장 전체가 롤백된다).
-- supabase/migrations 가 아니라 supabase/tests 에 둔다 — 마이그레이션 적용 대상이 아니다.
DO $$ BEGIN
  UPDATE public.review_sources SET citation_allowed = false, quote_policy = 'full' WHERE key = 'danawa';
  RAISE EXCEPTION 'NOT_BLOCKED: citation_allowed=false AND quote_policy=full';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'devto';
  RAISE EXCEPTION 'NOT_BLOCKED: tos prohibited AND quote_policy=full (devto)';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'tumblbug';
  RAISE EXCEPTION 'NOT_BLOCKED: tos forbids_automation AND quote_policy=full (tumblbug)';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  UPDATE public.review_sources SET quote_policy = 'bogus' WHERE key = 'danawa';
  RAISE EXCEPTION 'NOT_BLOCKED: quote_policy bogus value';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  UPDATE public.analysis_inputs SET rating = 6 WHERE id = (SELECT id FROM public.analysis_inputs LIMIT 1);
  RAISE EXCEPTION 'NOT_BLOCKED: rating 6';
EXCEPTION WHEN check_violation THEN NULL; END $$;
