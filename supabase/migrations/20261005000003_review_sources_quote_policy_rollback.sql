-- 롤백: 20261005000003_review_sources_quote_policy
-- ⚠️ 순서: lib/signals/feed.ts QUOTE_POLICY_COLUMN_READY 를 false 로 되돌린 뒤에 돌린다(반대면 /voc 조회가 42703 으로 죽는다).
-- ⚠️ 20261005000004·000005 가 적용돼 있으면 그 롤백을 먼저 돌린다. tos_status='forbids_automation' 행이 남아 있으면
--    아래 tos_status_chk 재생성이 23514 로 실패한다 — 그게 맞다(값을 지우는 판단은 사람이 한다).
-- ⚠️ DROP COLUMN 이 들어 있다 — 롤백 실행 자체는 사람 판단(§10.2 예외 1).

BEGIN;

ALTER TABLE public.review_sources DROP CONSTRAINT IF EXISTS review_sources_tos_restricts_quote_policy;
ALTER TABLE public.review_sources DROP CONSTRAINT IF EXISTS review_sources_quote_policy_needs_citation;
ALTER TABLE public.review_sources DROP CONSTRAINT IF EXISTS review_sources_quote_policy_chk;

ALTER TABLE public.review_sources DROP CONSTRAINT IF EXISTS review_sources_tos_status_chk;
ALTER TABLE public.review_sources
  ADD CONSTRAINT review_sources_tos_status_chk
    CHECK (tos_status IS NULL OR tos_status IN ('permitted', 'silent', 'prohibited', 'unverified'));

ALTER TABLE public.review_sources DROP COLUMN IF EXISTS quote_policy;

COMMENT ON COLUMN public.review_sources.quote_allowed IS '고객 화면·결론서에 원문을 한 문장 이내로 직접 인용해도 되는가(D안 2026-10-05). 약관 금지면 false (CHECK).';
COMMENT ON COLUMN public.review_sources.tos_status IS '약관 자동수집 조항: permitted / silent(조항 없음) / prohibited / unverified. NULL = 아직 기록 안 함.';

COMMIT;

-- 확인: SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_sources' AND column_name='quote_policy';  -- 기대: 0
--       SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='review_sources_tos_status_chk';  -- 기대: forbids_automation 없음
