-- ============================================================
-- 20261005000001_review_meta_and_source_policy — 리뷰 메타 3컬럼 + 소스 정책 7컬럼
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
-- 근거: 남헌 v16 B·C, v17 B·G, v18 (2026-10-05).
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 뿐이고 기존 행 UPDATE 는 없다.
--   - analysis_inputs: rating / lang / source_url. 소스·수집일은 source_key·collected_at 을 그대로 쓴다(중복 컬럼 안 만듦).
--   - review_sources: robots_status / tos_status / last_test_result / citation_allowed / quote_allowed / override / privacy_check.
--   - 기존 소스의 robots_status·tos_status 는 NULL(= 아직 기록 안 함)로 남긴다. 채우는 것은 대량 UPDATE 라 이 파일에 넣지 않았다
--     (§10.2 예외 2). 소스별 값은 등록 마이그·docs/review-source-findings*.md 에 흩어져 있어, 채울 때는 소스마다 근거 한 줄과 함께
--     별도 파일로 한다.
--   - quote_allowed 기본값 true 는 남헌 지시값이다. 기존 소스가 전부 true 로 시작한다는 뜻이므로, 약관 금지 소스는 위 별도 파일에서
--     false 로 내려야 한다. 그 전까지는 CHECK 두 개가 "기록된 금지"와 모순되는 값만 막는다.
--
-- 제약(추가 시점에 기존 행 위반 0 — 새 컬럼이 NULL/기본값이라서):
--   - citation_allowed=false 면 quote_allowed=false
--   - tos_status='prohibited' 면 quote_allowed=false
-- ============================================================

BEGIN;

ALTER TABLE public.analysis_inputs
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS lang text,
  ADD COLUMN IF NOT EXISTS source_url text;

DO $$ BEGIN
  ALTER TABLE public.analysis_inputs
    ADD CONSTRAINT analysis_inputs_rating_range CHECK (rating IS NULL OR rating BETWEEN 0 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.analysis_inputs
    ADD CONSTRAINT analysis_inputs_source_url_https CHECK (source_url IS NULL OR source_url ~ '^https://');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.analysis_inputs.rating IS '원 소스 별점 0~5 정규화(lib/review/types.ts ParsedReview.rating). 별점 없는 소스는 NULL.';
COMMENT ON COLUMN public.analysis_inputs.lang IS '리뷰 언어(BCP-47 소문자, 예: ko·en). 소스가 언어를 지정해 받은 경우만(googleplay hl). 추정하지 않는다 — 모르면 NULL.';
COMMENT ON COLUMN public.analysis_inputs.source_url IS '사람이 열어 볼 원문 주소(https). 내부 보존용 — 고객 화면에는 내지 않는다(D안, 2026-10-05). 기존 행은 raw_text 머리말 [SRC: …] 에만 있다.';

ALTER TABLE public.review_sources
  ADD COLUMN IF NOT EXISTS robots_status text,
  ADD COLUMN IF NOT EXISTS tos_status text,
  ADD COLUMN IF NOT EXISTS last_test_result text,
  ADD COLUMN IF NOT EXISTS citation_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quote_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS override text,
  ADD COLUMN IF NOT EXISTS privacy_check text;

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_robots_status_chk
      CHECK (robots_status IS NULL OR robots_status IN ('allowed', 'disallowed', 'unverified', 'not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_tos_status_chk
      CHECK (tos_status IS NULL OR tos_status IN ('permitted', 'silent', 'prohibited', 'unverified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_quote_needs_citation CHECK (citation_allowed OR NOT quote_allowed);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_tos_prohibited_no_quote CHECK (tos_status IS DISTINCT FROM 'prohibited' OR NOT quote_allowed);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.review_sources.robots_status IS 'robots 3상태 + 공식 API(not_applicable). unverified 는 허용이 아니다(§7.1). NULL = 아직 기록 안 함.';
COMMENT ON COLUMN public.review_sources.tos_status IS '약관 자동수집 조항: permitted / silent(조항 없음) / prohibited / unverified. NULL = 아직 기록 안 함.';
COMMENT ON COLUMN public.review_sources.last_test_result IS '마지막 수동·셀프테스트 결과 한 줄(날짜·무엇을·결과). 무인 루프는 쓰지 않는다(§10.1).';
COMMENT ON COLUMN public.review_sources.citation_allowed IS 'false 면 이 소스 내용을 근거로도 인용하지 않는다. false ⇒ quote_allowed=false (CHECK).';
COMMENT ON COLUMN public.review_sources.quote_allowed IS '고객 화면·결론서에 원문을 한 문장 이내로 직접 인용해도 되는가(D안 2026-10-05). 약관 금지면 false (CHECK).';
COMMENT ON COLUMN public.review_sources.override IS '사람이 정책을 예외로 연 기록. 형식 <주체>_<YYYY-MM-DD> (예: owner_2026-10-05). NULL = 예외 없음.';
COMMENT ON COLUMN public.review_sources.privacy_check IS '개인정보 비중 점검 메모(docs/review-collection-design.md §1.2). NULL = 미점검.';

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 컬럼 10개가 정확히 있다(information_schema — PostgREST HEAD 는 없는 컬럼도 통과시킨다)
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'analysis_inputs' AND column_name IN ('rating','lang','source_url'))
--        OR (table_name = 'review_sources' AND column_name IN ('robots_status','tos_status','last_test_result',
--            'citation_allowed','quote_allowed','override','privacy_check')))
--    ORDER BY 1, 2;
--   기대: 10행. citation_allowed·quote_allowed 는 NOT NULL default true.
-- 양성: 기존 소스 행은 전부 quote_allowed=true, robots_status/tos_status NULL(UPDATE 없음)
--   SELECT count(*) FILTER (WHERE quote_allowed) AS q_true, count(*) FILTER (WHERE robots_status IS NULL) AS robots_null, count(*) FROM public.review_sources;
-- 음성(롤백되는 형태 — 데이터 남기지 않음): 제약이 실제로 막는다
--   BEGIN;
--     UPDATE public.review_sources SET citation_allowed = false, quote_allowed = true WHERE key = 'danawa';  -- 기대: 23514 review_sources_quote_needs_citation
--   ROLLBACK;
--   BEGIN;
--     UPDATE public.review_sources SET tos_status = 'prohibited', quote_allowed = true WHERE key = 'danawa'; -- 기대: 23514 review_sources_tos_prohibited_no_quote
--   ROLLBACK;
--   BEGIN;
--     UPDATE public.analysis_inputs SET rating = 6 WHERE id = (SELECT id FROM public.analysis_inputs LIMIT 1);  -- 기대: 23514 analysis_inputs_rating_range
--   ROLLBACK;
