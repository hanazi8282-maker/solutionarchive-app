-- 롤백: 20261005000001_review_meta_and_source_policy
--
-- ⚠️ DROP COLUMN 이다 — 되돌리기 어려운 삭제라 §10.2 사람 판단 예외다. 세션이 스스로 돌리지 않는다.
--    적용 뒤 이 컬럼들에 값이 쌓였으면(googleplay rating·lang·source_url, appstore override 등) 함께 사라진다.
--    코드 쪽은 lib/review/store.ts 가 컬럼 부재(PGRST204/42703)를 만나면 옛 형태로 다시 넣으므로 수집은 멈추지 않는다.
--    lib/signals/feed.ts 는 QUOTE_POLICY_COLUMN_READY 를 false 로 되돌린 뒤에 이 파일을 돌린다(순서 반대면 /voc 조회가 42703 으로 죽는다).
--    20261005000002(appstore 활성화)를 먼저 롤백한다.

BEGIN;

ALTER TABLE public.review_sources
  DROP CONSTRAINT IF EXISTS review_sources_tos_prohibited_no_quote,
  DROP CONSTRAINT IF EXISTS review_sources_quote_needs_citation,
  DROP CONSTRAINT IF EXISTS review_sources_tos_status_chk,
  DROP CONSTRAINT IF EXISTS review_sources_robots_status_chk,
  DROP COLUMN IF EXISTS privacy_check,
  DROP COLUMN IF EXISTS override,
  DROP COLUMN IF EXISTS quote_allowed,
  DROP COLUMN IF EXISTS citation_allowed,
  DROP COLUMN IF EXISTS last_test_result,
  DROP COLUMN IF EXISTS tos_status,
  DROP COLUMN IF EXISTS robots_status;

ALTER TABLE public.analysis_inputs
  DROP CONSTRAINT IF EXISTS analysis_inputs_source_url_https,
  DROP CONSTRAINT IF EXISTS analysis_inputs_rating_range,
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS lang,
  DROP COLUMN IF EXISTS rating;

COMMIT;

-- 확인: 0행이어야 한다
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'analysis_inputs' AND column_name IN ('rating','lang','source_url'))
--        OR (table_name = 'review_sources' AND column_name IN ('robots_status','tos_status','last_test_result',
--            'citation_allowed','quote_allowed','override','privacy_check')));
