-- ============================================================
-- 20261005000003_review_sources_quote_policy — 인용 정책 3단계(quote_policy) + tos_status 'forbids_automation'
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
-- 선행: 20261005000001(정책 컬럼 · review_sources_tos_status_chk). 없으면 실패한다 — 그게 맞다.
-- 근거: 남헌 v19 A(2026-10-05, v16~v18 에 우선).
--
-- 🟢 비파괴.
--   - ADD COLUMN quote_policy text NOT NULL DEFAULT 'full' — 기존 26행은 'full' 로 채워진다(기본값, UPDATE 아님).
--   - quote_allowed(000001)는 **지우지 않는다**(DROP 은 사람 판단). 코드는 이제 quote_policy 만 읽는다 — deprecated 주석만 단다.
--   - tos_status CHECK 를 **넓힌다**: 기존 4값 유지 + 'forbids_automation'. 같은 이름(review_sources_tos_status_chk)으로 DROP→ADD,
--     한 트랜잭션 안이라 제약이 비는 순간이 밖에서 안 보인다. 기존 행은 전부 NULL(000001 적용 확인) → 위반 0.
--   - 정합 제약 2개(추가 시점 기존 행 위반 0 — citation_allowed 전부 true, tos_status 전부 NULL):
--       citation_allowed=false ⇒ quote_policy='none'
--       tos_status IN ('prohibited','forbids_automation') ⇒ quote_policy<>'full'
--
-- 코드 짝: lib/analysis/evidence-quotes.ts(quotePolicyOf·policyQuote·publicQuotes) · lib/signals/feed.ts
--   QUOTE_POLICY_COLUMN_READY 는 **이 파일 적용 확인 뒤** true 로 바꾼다. false 인 동안 /voc 발췌는 전부 빈 칸(fail-closed).
-- ============================================================

BEGIN;

ALTER TABLE public.review_sources
  ADD COLUMN IF NOT EXISTS quote_policy text NOT NULL DEFAULT 'full';

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_quote_policy_chk CHECK (quote_policy IN ('full', 'short_only', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tos_status 값 넓히기(기존 값 유지). 이름은 000001 이 만든 그대로.
ALTER TABLE public.review_sources DROP CONSTRAINT IF EXISTS review_sources_tos_status_chk;
ALTER TABLE public.review_sources
  ADD CONSTRAINT review_sources_tos_status_chk
    CHECK (tos_status IS NULL OR tos_status IN ('permitted', 'silent', 'prohibited', 'unverified', 'forbids_automation'));

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_quote_policy_needs_citation CHECK (citation_allowed OR quote_policy = 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.review_sources
    ADD CONSTRAINT review_sources_tos_restricts_quote_policy
      CHECK (tos_status IS NULL OR tos_status NOT IN ('prohibited', 'forbids_automation') OR quote_policy <> 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.review_sources.quote_policy IS
  '고객 화면 원문 인용 정책(남헌 v19 A 2026-10-05). full=한 문장 이내 / short_only=한 문장·140자 이내, 소스 이름·링크·작성자 비표시 / none=인용 불가. 모르는 값은 코드가 none 으로 본다. citation_allowed=false ⇒ none, 약관 금지(prohibited·forbids_automation) ⇒ full 불가(CHECK).';
COMMENT ON COLUMN public.review_sources.quote_allowed IS
  'DEPRECATED(2026-10-05, 20261005000003) — 코드는 quote_policy 만 읽는다. 값을 더 맞추지 않는다(읽는 곳 없음). 컬럼 삭제는 사람 판단이라 남겨 둔다.';
COMMENT ON COLUMN public.review_sources.tos_status IS
  '약관 자동수집 조항: permitted / silent(조항 없음) / prohibited(콘텐츠 이용 금지) / forbids_automation(자동 접근·크롤링 금지) / unverified. NULL = 아직 기록 안 함.';

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 컬럼·기본값(information_schema — PostgREST HEAD 는 없는 컬럼도 통과시킨다)
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'review_sources' AND column_name = 'quote_policy';
--   기대: 1행 · text · NO · 'full'::text
-- 양성: 제약 4개
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.review_sources'::regclass
--      AND conname IN ('review_sources_quote_policy_chk','review_sources_tos_status_chk',
--                      'review_sources_quote_policy_needs_citation','review_sources_tos_restricts_quote_policy');
--   기대: 4행, tos_status_chk 정의에 forbids_automation 포함
-- 양성: 기존 행 전부 full
--   SELECT quote_policy, count(*) FROM public.review_sources GROUP BY 1;   -- 기대: full | 26
-- 음성(롤백되는 형태 — 데이터 남기지 않음):
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'partial' WHERE key = 'danawa'; ROLLBACK;                 -- 기대: 23514 review_sources_quote_policy_chk
--   BEGIN; UPDATE public.review_sources SET citation_allowed = false, quote_allowed = false WHERE key = 'danawa'; ROLLBACK;  -- 기대: 23514 review_sources_quote_policy_needs_citation
--   BEGIN; UPDATE public.review_sources SET tos_status = 'forbids_automation' WHERE key = 'danawa'; ROLLBACK;        -- 기대: 23514 review_sources_tos_restricts_quote_policy
--   BEGIN; UPDATE public.review_sources SET tos_status = 'forbids_automation', quote_policy = 'short_only' WHERE key = 'danawa'; ROLLBACK;  -- 기대: 성공(1행) 후 롤백
--   BEGIN; UPDATE public.review_sources SET tos_status = 'bogus' WHERE key = 'danawa'; ROLLBACK;                    -- 기대: 23514 review_sources_tos_status_chk
