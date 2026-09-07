-- ============================================================
-- 20260906000001_case_study_pipeline
--
-- 케이스스터디 적립 3테이블 (M0).
--   case_studies ──1:N── case_moves ──1:N── case_evidence
--
-- 설계 근거 전문: docs/case-study-pipeline-design.md
--
-- 왜 3테이블인가 (초안은 1테이블이었다)
--   초안은 case_studies 한 테이블에 what_worked[] / what_failed[] 텍스트 배열을
--   두는 구조였다. 그걸로는 이 파이프라인의 두 목적을 둘 다 못 한다:
--     (1) "타 브랜드에서 통했던 패턴 참고" — 배열 원소 단위 검색·집계가 안 된다
--     (2) 근거 부착 — 근거가 필요한 건 케이스가 아니라 개별 주장이다
--   그래서 **무브(case_moves)** 를 원자로 삼는다. 매칭·승인·콘텐츠화가 전부
--   무브 단위다. 케이스는 무브를 담는 맥락일 뿐이다.
--
-- 실행 방법 (§12-5)
--   CLI/MCP 로 실행하지 않는다. Supabase 대시보드 SQL Editor 에서만 실행한다.
--   프로젝트 ref: qmgrfqjfxqhxuufrnkwf
--
-- 적용 후
--   node --env-file=.env.local scripts/case-pipeline-verify.mjs --probe
--   양성/음성/확인 불가 3상태로 찍는다. 확인 불가가 있으면 exit 2 다.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) case_studies — 맥락
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_studies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 중복 방지 키. posts.external_id 와 같은 역할이다.
  -- 같은 브랜드를 두 번 조사하면 새 케이스를 만들지 않고 이 행에
  -- 무브·근거를 덧붙인다 (append-only).
  slug                text NOT NULL UNIQUE,

  brand_name          text NOT NULL,
  market              text,
  geo                 text,

  -- ★ 매칭에 쓰는 축은 전부 고정 어휘다. 자유 태그로 두면 아무것도 안 맞고,
  --   그러면 "유사 사례 0건"이 로직 문제인지 진짜 없는 건지 구분이 안 된다.
  --   어휘를 늘릴 때는 마이그레이션으로 CHECK 를 바꾼다. 코드에서 늘리지 마라.
  business_model      text CHECK (business_model IN (
                        'D2C', 'MARKETPLACE_SELLER', 'SUBSCRIPTION', 'SAAS',
                        'CREATOR', 'SERVICE', 'WHOLESALE', 'OTHER')),
  buyer_type          text CHECK (buyer_type IN ('B2C', 'B2B', 'B2B2C')),
  purchase_frequency  text CHECK (purchase_frequency IN (
                        'ONE_OFF', 'OCCASIONAL', 'REPEAT', 'CONTRACT')),
  price_band          text CHECK (price_band IN ('LOW', 'MID', 'HIGH', 'ENTERPRISE')),

  -- 매칭의 1순위 축. 업종이 아니라 **병목**이 같은 사례를 찾는 게 이 제품의
  -- 값이다. 업종으로 좁히면 "다른 탈모샴푸 브랜드"만 나온다.
  bottleneck          text CHECK (bottleneck IN (
                        'AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION',
                        'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY')),

  -- ⚠️ 기본값이 'active' 가 아니라 'unknown' 이다.
  --   웹서치는 성공 사례로 쏠린다(생존 편향). 지금 살아 있는지 확인 안 했으면
  --   확인 안 한 것이다. 기본값을 active 로 두면 "확인 실패"가 "정상 영업 중"
  --   으로 접힌다 (CLAUDE.md §7.1).
  outcome_status      text NOT NULL DEFAULT 'unknown'
                        CHECK (outcome_status IN ('active', 'pivoted', 'shutdown', 'unknown')),

  period_start        date,
  period_end          date,
  summary             text,

  -- 자유 태그. 사람이 읽는 용도다. **매칭에 쓰지 않는다.**
  tags                text[] NOT NULL DEFAULT '{}',

  -- 검수 축. 근거 축(case_moves.evidence_grade)과 **별개다.**
  -- 승인된 D등급 케이스는 정상적으로 존재한다 — 맥락은 맞지만 수치 근거가
  -- 없는 사례다. 하나로 합치면 "승인됨"이 "사실로 검증됨"으로 읽힌다.
  review_status       text NOT NULL DEFAULT 'draft'
                        CHECK (review_status IN ('draft', 'approved', 'rejected')),

  researched_by       text,
  reviewed_by         text,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_studies_period_order
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

COMMENT ON TABLE public.case_studies IS
  '케이스스터디 맥락. 실행 단위는 case_moves 다. 설계: docs/case-study-pipeline-design.md';
COMMENT ON COLUMN public.case_studies.bottleneck IS
  '매칭 1순위 축. 업종이 아니라 병목이 같은 사례를 찾는다.';
COMMENT ON COLUMN public.case_studies.outcome_status IS
  '기본값 unknown. 확인 안 한 것을 active 로 접지 않는다 (§7.1).';
COMMENT ON COLUMN public.case_studies.review_status IS
  '사람이 봤는가. 근거가 충분한가(evidence_grade)와 다른 축이다.';

CREATE INDEX IF NOT EXISTS case_studies_bottleneck_idx
  ON public.case_studies (bottleneck, business_model)
  WHERE review_status = 'approved';

CREATE INDEX IF NOT EXISTS case_studies_review_idx
  ON public.case_studies (review_status, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 2) case_moves — 실행 1개. 이 시스템의 원자.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_moves (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id          uuid NOT NULL
                           REFERENCES public.case_studies(id) ON DELETE CASCADE,

  -- 무엇을 바꿨나.
  lever                  text NOT NULL CHECK (lever IN (
                           'POSITIONING', 'PRICING', 'PACKAGING', 'CHANNEL',
                           'CONTENT', 'COMMUNITY', 'ONBOARDING', 'PRODUCT_FEATURE',
                           'OPERATIONS', 'PARTNERSHIP', 'OFFER')),

  claim                  text NOT NULL,

  outcome_direction      text NOT NULL DEFAULT 'positive'
                           CHECK (outcome_direction IN ('positive', 'negative', 'mixed')),

  metric_name            text,
  metric_before          numeric,
  metric_after           numeric,
  metric_unit            text,

  -- ★ valid_until 을 쓰지 않는 이유
  --   "언제까지 유효한가"는 미래 예측이라 리서치 시점에 채울 근거가 없다.
  --   전부 NULL 로 남고, NULL 이 "유효기간 없음"으로 읽힌다. 이 리포에 이미
  --   그 꼴인 컬럼이 있다 — profile_clicks 는 수집기가 안 채워서 NULL 인데
  --   화면에서 "클릭 0"과 구분되지 않았다.
  --   대신 **언제 관측된 사실인가**를 적는다. 과거형이라 실제로 채울 수 있고,
  --   낡음 판정은 조회 시점에 나이를 계산해서 한다.
  observed_period_start  date,
  observed_period_end    date,

  -- 근거 축. case_evidence 행들로부터 파이프라인이 계산해서 쓴다.
  --   A = 독립 출처 2개 이상이 같은 수치를 뒷받침, 또는 비자기보고 primary 1개
  --   B = 자기보고 primary 1개 + 다른 출처 1개
  --   C = 단일 출처
  --   D = 수치 없음 (서술만)
  -- D 를 버리지 않는다. 저장하되 PMF 스코어링 입력에서 뺀다.
  -- "근거가 약함"과 "존재하지 않음"은 다르다.
  evidence_grade         text NOT NULL DEFAULT 'D'
                           CHECK (evidence_grade IN ('A', 'B', 'C', 'D')),

  -- ★ 승인 단위가 케이스가 아니라 무브다.
  --   검수자는 1명이고 웹서치는 무한히 생성된다. 케이스 통째로만 승인할 수
  --   있으면 무브 5개 중 1개가 미심쩍다는 이유로 나머지 4개까지 막힌다.
  --   전부-아니면-전무 승인이 병목의 실제 원인이다.
  review_status          text NOT NULL DEFAULT 'draft'
                           CHECK (review_status IN ('draft', 'approved', 'rejected')),

  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_moves_observed_order
    CHECK (observed_period_end IS NULL OR observed_period_start IS NULL
           OR observed_period_end >= observed_period_start),

  -- 수치를 적었으면 단위와 이름도 적어야 한다. 숫자만 떠 있으면 나중에
  -- 아무도 그게 뭐였는지 복원하지 못한다.
  CONSTRAINT case_moves_metric_named
    CHECK (metric_after IS NULL OR (metric_name IS NOT NULL AND metric_unit IS NOT NULL))
);

COMMENT ON TABLE public.case_moves IS
  '실행 1개. 매칭·승인·콘텐츠화가 전부 이 단위다.';
COMMENT ON COLUMN public.case_moves.observed_period_start IS
  'valid_until 대신. 언제 관측된 사실인가를 적고, 낡음 판정은 조회 시점에 한다.';
COMMENT ON COLUMN public.case_moves.evidence_grade IS
  'A/B/C/D. 검수(review_status)와 별개 축이다. 수치 없으면 D.';

CREATE INDEX IF NOT EXISTS case_moves_case_idx
  ON public.case_moves (case_study_id);

-- 소비 경로의 기본 필터: 승인된 것 중 근거 있는 것.
CREATE INDEX IF NOT EXISTS case_moves_usable_idx
  ON public.case_moves (lever, evidence_grade)
  WHERE review_status = 'approved';


-- ────────────────────────────────────────────────────────────
-- 3) case_evidence — 근거 1줄
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id    uuid NOT NULL
                     REFERENCES public.case_studies(id) ON DELETE CASCADE,

  -- 케이스 전체를 뒷받침하는 근거는 move 가 없을 수 있다.
  case_move_id     uuid REFERENCES public.case_moves(id) ON DELETE CASCADE,

  url              text NOT NULL,

  -- 독립성 판정에 쓴다. 같은 보도자료를 받아쓴 기사 5개는 출처 1개다.
  domain           text,

  -- 아래 넷은 **서로 독립된 축**이다. 하나로 뭉치면 안 된다.
  --   source_tier      : 1차/2차/3차
  --   is_self_reported : 당사자가 자기 성과를 말한 것인가
  --                      ★ tier 와 독립이다. 창업자 인터뷰는 primary 이면서
  --                        자기보고다 — 가장 흔하고 가장 위험한 조합이다.
  --   published_at     : 원문 시점. **최신성은 이걸로 판단한다.**
  --                      어제 긁어온 2019년 기사는 어제 정보가 아니다.
  --   retrieved_at     : 우리가 본 시점. 원문이 사라졌을 때 대조용.
  --   is_estimate      : 이 수치가 외부 추정인가 (기업이 공개하지 않아 조사기관이
  --                      추정한 값). ★ tier 와도, self_reported 와도 독립이다.
  --                      비상장사 매출은 대부분 여기 걸린다 — 신뢰할 만한
  --                      조사기관(secondary)의 비자기보고 추정치라 앞의 두 축만
  --                      보면 최고 등급이 나오는데, 실제로는 아무도 실측한 적이
  --                      없는 숫자다. 이 리포의 "무효 vs 보류" 구분과 같은 층위다.
  --   is_regulatory_filing : 법정 공시 문서인가 (DART 감사보고서, SEC S-1/10-K/8-K).
  --                      ★ 자기보고이지만 허위기재에 법적 책임이 따른다.
  --                      이 축이 없으면 등급이 뒤집힌다 — 시범 5건 중 2건에서
  --                      실제로 그랬다. 캐스퍼 S-1 과 듀오링고 8-K 가 "자기보고
  --                      1차뿐"이라 C 로 떨어지는데, 출처를 안 밝힌 블로그 2개는
  --                      "독립 도메인 2곳"이라 A 가 됐다. 산식이 보수적인 게
  --                      아니라 틀린 것이다.
  source_tier      text NOT NULL DEFAULT 'tertiary'
                     CHECK (source_tier IN ('primary', 'secondary', 'tertiary')),
  is_self_reported boolean NOT NULL DEFAULT false,
  is_estimate      boolean NOT NULL DEFAULT false,
  is_regulatory_filing boolean NOT NULL DEFAULT false,
  published_at     date,

  -- 공시 문서는 1차 출처다. 2차로 표시된 공시는 입력 오류다.
  CONSTRAINT case_evidence_filing_is_primary
    CHECK (NOT is_regulatory_filing OR source_tier = 'primary'),
  retrieved_at     timestamptz NOT NULL DEFAULT now(),

  -- ⚠️ 인용 분량 상한을 정책이 아니라 제약으로 건다.
  --   저작권 리스크는 실명이 아니라 인용 분량에 있다. 문서로 "짧게 쓰자"고
  --   적으면 지켜지지 않는다. 원문 전문은 저장하지 않는다.
  snippet          text CHECK (snippet IS NULL OR length(snippet) <= 300),

  supports_claim   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_evidence IS
  '근거 1줄. 신뢰도는 케이스가 아니라 주장(move)의 속성이라 여기서 계산해 올린다.';
COMMENT ON COLUMN public.case_evidence.is_self_reported IS
  'source_tier 와 독립된 축. primary + self_reported 조합이 가장 위험하다.';
COMMENT ON COLUMN public.case_evidence.is_estimate IS
  '외부 추정치인가. 비상장사 매출이 대부분 여기 해당한다. 추정치는 등급 A 를 만들지 못한다.';
COMMENT ON COLUMN public.case_evidence.is_regulatory_filing IS
  'DART/SEC 등 법정 공시. 자기보고이지만 허위기재에 법적 책임이 따라 등급 A 를 만든다.';
COMMENT ON COLUMN public.case_evidence.published_at IS
  '원문 시점. 최신성 판단은 retrieved_at 이 아니라 이것으로 한다.';
COMMENT ON COLUMN public.case_evidence.snippet IS
  '300자 상한. 원문 전문 저장 금지 — 인용 분량이 실제 법적 리스크다.';

CREATE INDEX IF NOT EXISTS case_evidence_move_idx
  ON public.case_evidence (case_move_id);
CREATE INDEX IF NOT EXISTS case_evidence_case_idx
  ON public.case_evidence (case_study_id);


-- ============================================================
-- 검증 쿼리 (적용 직후 실행) — 양성 / 음성 둘 다 돌린다
--
-- ⚠️ "에러 안 났다"만으로 통과 처리하지 않는다. 제약이 실제로 **막는지**를
--    확인해야 한다. 막아야 할 것이 안 막히면 그건 제약이 없는 것이다.
-- ============================================================
--
-- ── 양성 1) 3테이블이 생겼는가
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('case_studies','case_moves','case_evidence')
--  ORDER BY table_name;
--   기대: 3행
--
-- ── 양성 2) 정상 INSERT 가 되는가 (끝에서 지운다)
-- INSERT INTO public.case_studies (slug, brand_name, bottleneck, business_model)
--   VALUES ('__probe__', '검증용', 'TRUST', 'D2C');
--   기대: 성공. outcome_status 가 'unknown' 으로, review_status 가 'draft' 로 채워진다
-- SELECT slug, outcome_status, review_status, tags FROM public.case_studies WHERE slug='__probe__';
--   기대: unknown | draft | {}
--
-- ── 음성 1) 어휘 밖 bottleneck 은 거절돼야 한다
-- INSERT INTO public.case_studies (slug, brand_name, bottleneck)
--   VALUES ('__probe2__', 'x', 'VIBES');
--   기대: ERROR 23514 check constraint "case_studies_bottleneck_check"
--
-- ── 음성 2) slug 중복은 거절돼야 한다
-- INSERT INTO public.case_studies (slug, brand_name) VALUES ('__probe__', '중복');
--   기대: ERROR 23505 unique_violation
--
-- ── 음성 3) 300자 넘는 스니펫은 거절돼야 한다
-- INSERT INTO public.case_evidence (case_study_id, url, snippet)
--   SELECT id, 'https://example.com', repeat('가', 301) FROM public.case_studies WHERE slug='__probe__';
--   기대: ERROR 23514 check constraint "case_evidence_snippet_check"
--
-- ── 음성 4) 수치만 있고 이름·단위가 없으면 거절돼야 한다
-- INSERT INTO public.case_moves (case_study_id, lever, claim, metric_after)
--   SELECT id, 'PRICING', '가격 올렸더니 잘 됨', 42 FROM public.case_studies WHERE slug='__probe__';
--   기대: ERROR 23514 check constraint "case_moves_metric_named"
--
-- ── 음성 5) 기간 역전은 거절돼야 한다
-- INSERT INTO public.case_moves (case_study_id, lever, claim, observed_period_start, observed_period_end)
--   SELECT id, 'PRICING', 'x', '2026-01-01', '2025-01-01' FROM public.case_studies WHERE slug='__probe__';
--   기대: ERROR 23514 check constraint "case_moves_observed_order"
--
-- ── 정리
-- DELETE FROM public.case_studies WHERE slug LIKE '\_\_probe%';
--   (case_moves / case_evidence 는 ON DELETE CASCADE 로 같이 지워진다)
-- SELECT count(*) FROM public.case_studies WHERE slug LIKE '\_\_probe%';
--   기대: 0


-- ============================================================
-- 거부한 대안 — 지우지 않고 남긴다
-- ============================================================
--
-- (A) 단일 테이블 + what_worked[] / what_failed[] text[]
--     초안이 이거였다. 배열 원소 단위로 검색·집계·근거부착이 전부 안 된다.
--     "타 브랜드에서 통했던 패턴 참고"가 이 제품의 값인데, 그 패턴이
--     텍스트 배열 안에 갇혀 있으면 꺼낼 방법이 없다.
--
-- (B) evidence 에 단일 `confidence` 점수 컬럼 (0~1)
--     source_tier / is_self_reported / published_at 을 한 숫자로 접는 안.
--     버렸다 — 접는 순간 "왜 낮은지"가 사라진다. 오래된 1차 출처와
--     최신 3차 출처가 같은 0.5 가 되는데, 둘은 다르게 다뤄야 한다.
--     신뢰도를 하나의 숫자로 요구하는 건 소비하는 쪽이지 저장하는 쪽이 아니다.
--
-- (C) evidence_grade 를 GENERATED 컬럼으로
--     opportunity_score 처럼 DB 가 계산하게 하는 안. 매력적이지만 등급 산식이
--     **다른 행(case_evidence)들을 봐야** 나온다. GENERATED 는 같은 행의
--     컬럼만 참조할 수 있어서 불가능하다. 트리거로도 되지만, 산식이 아직
--     한 번도 실데이터로 검증되지 않았다 — 굳히기 전에 파이프라인에서
--     계산하며 몇 라운드 돌려본다. 안정되면 그때 트리거로 내린다.
--
-- (D) case_moves.pattern_id + case_patterns 를 지금 같이 만들기
--     M1 로 미뤘다. 쓰이지 않는 스키마는 검증되지 않은 채 "있으니까 맞겠지"로
--     굳는다. 바로 이번 라운드에 post_decision_link 를 켜자마자 채점기가
--     posts.format 을 select 해서 42703 으로 죽었다 — 링크 테이블이 없는 동안
--     그 경로가 한 번도 안 돌아서 안 드러난 버그였다. 같은 실수를 반복하지 않는다.
--
-- (E) analysis_aspects 에 FK 걸기
--     케이스는 특정 분석 프로젝트에 속하지 않는다. 한 케이스가 여러 프로젝트
--     진단에 쓰인다. 연결은 M2 의 pmf_assessments 가 맡는다.
--
-- (F) content_items.source_case 에 FK 걸기
--     안 건다. post_decision_link 가 마크다운 정본을 형식 CHECK 로만 참조한
--     것과 같은 판단이다. 느슨하게 두고 대조는 검증 스크립트가 한다.
