-- 20260906000003_case_evidence_issuer_defined_metric.sql
--
-- L-56: 근거 등급 산식이 "법정 공시 1건이면 A" 를 무조건 적용하고 있었다.
--
-- 그 규칙의 전제는 "허위기재에 법적 책임이 따르는 문서"인데, 그 책임은 문서
-- 전체가 아니라 **검증 범위 안의 수치**에만 붙는다. Nubank 20-F 는 본문에서
-- ARPAC·고객수·NPS 를 두고 "which are not independently verified by any third
-- party" 라고 스스로 밝힌다. 산식이 그 문장보다 관대했다 — 문서가 "이 숫자는
-- 검증 안 됐다"고 말하는데 파이프라인은 "법정 공시니까 A"를 줬다.
--
-- 전수 점검 결과 Nubank 만의 문제가 아니었다. A 등급 22개 중 21개가 공시
-- 1건에 의존하고, 그중 12개가 발행사 자체 정의 운영지표(DAU·NDR·활성고객수·
-- Autoship 비중·재구매율 등)다. 재무제표 본문 수치(매출·매출총이익률·충당금)와
-- 같은 등급을 받고 있었다.
--
-- 그래서 6축에 7번째 축을 더한다. tier / self_reported / estimate / filing 과
-- 모두 독립이다 — "1차 출처이고 자기보고이며 법정 공시인데 감사 범위 밖"이
-- 실제로 가장 흔한 조합이기 때문이다.
--
-- ⚠️ 이 마이그레이션은 컬럼만 만든다. 기존 62행은 DEFAULT false 로 들어가
--    적용 직후 등급은 하나도 바뀌지 않는다. 등급이 바뀌는 것은 아래 (2) 백필을
--    사람이 검토하고 실행한 다음이다. 스키마 변경과 판정 변경을 한 트랜잭션에
--    섞지 않는다 — 섞으면 "언제부터 등급이 달라졌는지"를 되짚을 수 없다.

BEGIN;

-- (1) 축 추가 -------------------------------------------------------------
ALTER TABLE public.case_evidence
  ADD COLUMN IF NOT EXISTS is_issuer_defined_metric boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.case_evidence.is_issuer_defined_metric IS
  '이 근거가 뒷받침하는 수치가 발행사 자체 정의·집계 지표인가. 법정 공시 안에 '
  '있어도 감사인 의견·제3자 검증 범위 밖인 숫자(DAU·활성고객수·ARPAC·NDR·'
  '재구매율 등)에 true. 재무제표 본문 수치에는 false. true 면 등급 산식의 '
  '"법정 공시 1건 = A" 경로에서 제외되고 교차 확인 경로로 다시 판정된다. L-56.';

-- 자체 정의 지표는 그 자체로는 아무것도 뒷받침하지 못한다. 추정치이기까지 하면
-- 근거가 아니라 소문이다. 실수로 둘 다 켜는 것을 막는다.
ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_issuer_metric_not_estimate;
ALTER TABLE public.case_evidence
  ADD CONSTRAINT case_evidence_issuer_metric_not_estimate
  CHECK (NOT (is_issuer_defined_metric AND is_estimate));

COMMIT;


-- (2) 백필 — ★ 위와 별도로, 검토한 뒤 따로 실행할 것 ------------------------
--
-- 아래 12개 무브에 붙은 공시 근거가 발행사 자체 정의 운영지표를 뒷받침한다.
-- 실행하면 해당 무브의 등급이 A → C(또는 B) 로 내려간다. 등급은 저장 시점에
-- case_moves.evidence_grade 에 박히므로, 백필 후에는 재계산 스크립트를 돌려야
-- 무브 행에 반영된다 (scripts/case-review.mjs 로 재커밋하거나 별도 재계산).
--
-- BEGIN;
-- UPDATE public.case_evidence e SET is_issuer_defined_metric = true
--   FROM public.case_moves m, public.case_studies c
--  WHERE e.case_move_id = m.id AND m.case_study_id = c.id
--    AND e.is_regulatory_filing
--    AND (c.slug, m.lever) IN (
--      ('casper-dtc-unit-economics',        'CHANNEL'),          -- 재구매 고객 비중
--      ('duolingo-streak',                  'PRODUCT_FEATURE'),  -- DAU
--      ('warby-parker-home-try-on',         'CHANNEL'),          -- 활성고객 증가율
--      ('warby-parker-home-try-on',         'OFFER'),            -- 재구매 고객 비중
--      ('figma-non-designer-distribution',  'PRODUCT_FEATURE'),  -- 비디자이너 비중
--      ('figma-non-designer-distribution',  'PACKAGING'),        -- NDR
--      ('slack-bottom-up-conversion',       'PRICING'),          -- NDR
--      ('carvana-360-imaging-trust',        'PRODUCT_FEATURE'),  -- retail units sold
--      ('chewy-autoship-retention',         'PACKAGING'),        -- Autoship 비중
--      ('chewy-autoship-retention',         'PRODUCT_FEATURE'),  -- 활성고객당 순매출
--      ('nubank-word-of-mouth-acquisition', 'COMMUNITY'),        -- 누적 고객 수
--      ('nubank-word-of-mouth-acquisition', 'PRICING')           -- ARPAC
--    );
-- COMMIT;
--
-- 켜지 않는 것들(재무제표 본문 수치라 법적 책임 전제가 그대로 성립한다):
--   casper/OFFER 판매·마케팅비 비중, oatly/OPERATIONS 매출총이익률·공장 수,
--   slack/PACKAGING 연간 매출, peloton/OPERATIONS 재고충당금·PARTNERSHIP 투자액,
--   elf/CONTENT 마케팅비 비중·POSITIONING 순매출, carvana/OFFER 진출 시장 수.
