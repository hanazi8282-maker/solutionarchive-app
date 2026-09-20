-- PMF 제품화 1차 — 진단이 앱 안에서 돌 수 있게 프로젝트에 패싯을 붙인다 (2026-09-20 남헌 지시 PART C)
--
-- 적용: CLAUDE.md §10.2(2026-09-20 개정) — 대화형 세션 자체 판단. 전부 **추가(ADD COLUMN IF NOT EXISTS /
--       CREATE TABLE IF NOT EXISTS)** 라 기존 행·컬럼을 건드리지 않는다. 롤백은 `_rollback.sql`.
--
-- 왜: PMF 2축 진단(`scripts/pmf-assess.mjs`)은 사람이 JSON 파일로 5입력(아이템·시장·병목·가격대·구매자…)을
--     넣어야만 돌았다. 로그인한 셀러가 자기 프로젝트에서 "진단" 을 누르려면 그 입력이 프로젝트에 있어야 한다.
--     어휘는 case_studies 와 같다(lib/cases/draft.ts BOTTLENECK/BUSINESS_MODEL/BUYER_TYPE/PRICE_BAND/PURCHASE_FREQUENCY)
--     — 같은 어휘라야 matchMoves 의 패싯 정렬이 성립한다. 패싯은 **거르는 데 쓰지 않고 정렬에만** 쓴다.
--
-- 1) analysis_projects — 진단 입력 6개. 전부 NULL 허용(기존 24행은 비어 있다. 비어 있으면 화면이 "진단 전 입력 필요" 로 안내).

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS market             text,
  ADD COLUMN IF NOT EXISTS bottleneck         text
    CHECK (bottleneck IS NULL OR bottleneck IN ('AWARENESS','TRUST','CONVERSION','RETENTION','UNIT_ECONOMICS','DISTRIBUTION','SUPPLY')),
  ADD COLUMN IF NOT EXISTS business_model     text
    CHECK (business_model IS NULL OR business_model IN ('D2C','MARKETPLACE_SELLER','SUBSCRIPTION','SAAS','CREATOR','SERVICE','WHOLESALE','OTHER')),
  ADD COLUMN IF NOT EXISTS buyer_type         text
    CHECK (buyer_type IS NULL OR buyer_type IN ('B2C','B2B','B2B2C')),
  ADD COLUMN IF NOT EXISTS price_band         text
    CHECK (price_band IS NULL OR price_band IN ('LOW','MID','HIGH','ENTERPRISE')),
  ADD COLUMN IF NOT EXISTS purchase_frequency text
    CHECK (purchase_frequency IS NULL OR purchase_frequency IN ('ONE_OFF','OCCASIONAL','REPEAT','CONTRACT'));

COMMENT ON COLUMN public.analysis_projects.bottleneck IS
  'PMF 진단 입력(사람이 고른 가설 병목). NULL 이면 진단을 돌리지 않는다 — 추정하지 않는다(§7.1). 어휘 lib/cases/draft.ts BOTTLENECK';
COMMENT ON COLUMN public.analysis_projects.market IS
  'PMF 진단 입력(시장 한 줄). 아이템은 product_elevator_pitch 를 그대로 쓴다.';

-- 2) analysis_aspects — 속성을 낳은 리뷰 원문 인용. 추출 프롬프트가 채운다(lib/analysis/extract-run.ts).
--    [{ "text": "원문 문장", "source_type": "review" }] 형태. 비어 있으면 [] — "인용 없음" 과 "컬럼 없음" 을 가른다.
--    ⚠️ 기존 35행은 [] 다. 재추출(force) 해야 채워진다 — 화면은 [] 를 "인용 없음(재분석하면 채워짐)" 으로 말한다.

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS evidence_quotes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.analysis_aspects.evidence_quotes IS
  '이 속성을 뽑아낸 리뷰 원문 1~3문장(그대로 인용). 판정 옆에 재료를 둔다 — Atria "creatives alongside the answer" 의 우리판.';

-- 3) seller_profiles — 온보딩 입력을 일회용 폼이 아니라 재사용 객체로(SuperX personality profile · Foreplay Brand Profiles).
--    허용목록 로그인 이메일 1개당 1행. /analyze/new 1단계를 프리필하고, 저장된 패싯을 진단 입력 기본값으로 쓴다.

CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email        text NOT NULL UNIQUE,
  pitch              text,
  market             text,
  bottleneck         text
    CHECK (bottleneck IS NULL OR bottleneck IN ('AWARENESS','TRUST','CONVERSION','RETENTION','UNIT_ECONOMICS','DISTRIBUTION','SUPPLY')),
  business_model     text
    CHECK (business_model IS NULL OR business_model IN ('D2C','MARKETPLACE_SELLER','SUBSCRIPTION','SAAS','CREATOR','SERVICE','WHOLESALE','OTHER')),
  buyer_type         text
    CHECK (buyer_type IS NULL OR buyer_type IN ('B2C','B2B','B2B2C')),
  price_band         text
    CHECK (price_band IS NULL OR price_band IN ('LOW','MID','HIGH','ENTERPRISE')),
  purchase_frequency text
    CHECK (purchase_frequency IS NULL OR purchase_frequency IN ('ONE_OFF','OCCASIONAL','REPEAT','CONTRACT')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seller_profiles IS
  '판매자 프로필(로그인 이메일당 1행). /analyze/new 프리필 + PMF 진단 입력 기본값. 필터가 아니라 정렬 재료다.';

-- 확인 쿼리 (적용 후 사람이 돌린다)
-- SELECT column_name FROM information_schema.columns WHERE table_name='analysis_projects' AND column_name IN ('market','bottleneck','business_model','buyer_type','price_band','purchase_frequency');
-- SELECT column_name FROM information_schema.columns WHERE table_name='analysis_aspects' AND column_name='evidence_quotes';
-- SELECT count(*) FROM public.seller_profiles;
