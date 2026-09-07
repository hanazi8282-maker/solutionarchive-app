-- 20260907000001_case_evidence_observation_keys.sql
--
-- L-60 + L-64 를 한 번에 고친다. 두 결함은 뿌리가 같다.
--
--   L-60: `gradeMove` 는 독립성을 **도메인**으로 센다. S-1 하나를 읽고 쓴
--         뉴스레터 2곳은 도메인 2개라 "독립 근거 2건"이 되고 등급이 A 로 오른다.
--         도메인은 2개지만 **관측은 1개**다.
--   L-64: `gradeMove` 는 근거를 **무브** 단위로 센다. 무브가 담는 주장은
--         수치 하나만이 아닌데(예: chewy/PRODUCT_FEATURE 는 "기능이 Autoship
--         전용이었다"와 "고객당 순매출 434→555" 둘을 함께 담는다), 앞쪽만
--         받치는 근거를 넣어도 뒤쪽 수치의 등급이 같이 오른다.
--
-- 한 문장: **산식이 세는 단위는 "행"인데, 세야 하는 것은 "서로 다른 관측 ×
-- 그 관측이 실제로 받치는 주장"이다.** 그래서 축을 두 개 더한다.
--
--   observation_key — 이 행이 전하는 **원 관측**의 이름. 같은 관측을 옮긴
--                     행끼리는 같은 키를 갖는다. 독립성은 도메인이 아니라
--                     이 키의 가짓수로 센다.
--   supports_metric — 이 행이 무브의 **수치**를 직접 받치는가. 서사·메커니즘만
--                     받치면 false.
--
-- ⚠️ 둘 다 NULL 을 허용한다. NULL 은 "아니다"가 아니라 **"확인하지 않았다"**이고,
--    산식은 확인하지 않은 것을 독립으로도 수치 뒷받침으로도 세지 않는다(§7.1).
--    그래서 **적용 직후에는 등급이 내려간다** — 지금 72행 전부가 NULL 이기 때문이다.
--    이건 근거가 나빠져서가 아니라 아직 안 적어서다. 아래 (4) 백필 지침대로
--    사람이 키를 채운 다음에 `case-review.mjs regrade` 를 돌려야 의미 있는 값이 나온다.
--    `regrade` 는 키 커버리지가 0 이면 **경고하고 멈춘다**(`--force` 필요) —
--    백필 전 재채점 결과를 "근거가 약해졌다"로 읽는 사고를 막기 위해서다.
--
-- ⚠️ 스키마 변경과 판정 변경을 한 트랜잭션에 섞지 않는다(마이그 3 과 같은 원칙).
--    이 파일은 컬럼만 만든다.

BEGIN;

-- (1) 원 관측 키 -----------------------------------------------------------
ALTER TABLE public.case_evidence
  ADD COLUMN IF NOT EXISTS observation_key text;

COMMENT ON COLUMN public.case_evidence.observation_key IS
  '이 근거가 전하는 원 관측의 식별자. 같은 관측을 옮겨 적은 행끼리 같은 값을 '
  '갖는다(예: Chewy 10-K 원문과 그것을 받아쓴 Retail Dive 기사 → 둘 다 '
  'chwy-10k-fy2023). 등급 산식의 "독립" 은 도메인이 아니라 이 키의 가짓수로 '
  '센다. NULL 은 "독립 관측이 아니다" 가 아니라 "확인하지 않았다" 이고, '
  '산식은 NULL 을 독립으로 세지 않는다. L-60.';

-- 빈 문자열은 NULL 과 다른 값으로 취급돼 "키를 적었다"로 세어진다. 막는다.
ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_observation_key_shape;
ALTER TABLE public.case_evidence
  ADD CONSTRAINT case_evidence_observation_key_shape
  CHECK (observation_key IS NULL
         OR observation_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

CREATE INDEX IF NOT EXISTS case_evidence_observation_idx
  ON public.case_evidence (observation_key);

-- (2) 수치 뒷받침 여부 -----------------------------------------------------
ALTER TABLE public.case_evidence
  ADD COLUMN IF NOT EXISTS supports_metric boolean;

COMMENT ON COLUMN public.case_evidence.supports_metric IS
  '이 근거가 무브의 수치(metric_before→metric_after)를 직접 받치는가. 기능의 '
  '존재·시기·메커니즘 같은 서사만 받치면 false. NULL 은 "확인하지 않았다" 이고 '
  '산식은 NULL 을 수치 뒷받침으로 세지 않는다. 이 축이 없으면 무브의 서사만 '
  '다루는 독립 매체 1건이 아무도 검증하지 않은 수치의 등급을 올린다. L-64.';

-- 케이스 단위 근거(case_move_id IS NULL)에는 받칠 수치가 없다.
-- 거기에 supports_metric=true 를 적는 건 입력 오류다.
ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_supports_metric_needs_move;
ALTER TABLE public.case_evidence
  ADD CONSTRAINT case_evidence_supports_metric_needs_move
  CHECK (case_move_id IS NOT NULL OR supports_metric IS NOT TRUE);

COMMIT;


-- ============================================================
-- (3) 검증 쿼리 — 양성 / 음성 둘 다 돌린다
-- ============================================================
--
-- ── 양성 1) 컬럼 2개가 생겼는가
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_evidence'
--    AND column_name IN ('observation_key','supports_metric')
--  ORDER BY column_name;
--   기대: 2행 / observation_key=text,YES / supports_metric=boolean,YES
--
-- ── 양성 2) 정상 값이 들어가는가
-- UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023'
--  WHERE url LIKE '%chwy-20240128%';
--   기대: UPDATE 3 (10-K 를 인용한 근거 3행)
--
-- ── 음성 1) 대문자·공백·언더스코어가 섞인 키는 거절돼야 한다
-- UPDATE public.case_evidence SET observation_key='CHWY 10K_2023'
--  WHERE url LIKE '%chwy-20240128%';
--   기대: ERROR 23514 check constraint "case_evidence_observation_key_shape"
--
-- ── 음성 2) 빈 문자열도 거절돼야 한다
-- UPDATE public.case_evidence SET observation_key=''
--  WHERE url LIKE '%chwy-20240128%';
--   기대: ERROR 23514 check constraint "case_evidence_observation_key_shape"
--
-- ── 음성 3) 케이스 단위 근거에 supports_metric=true 는 거절돼야 한다
-- UPDATE public.case_evidence SET supports_metric=true WHERE case_move_id IS NULL;
--   기대: ERROR 23514 check constraint "case_evidence_supports_metric_needs_move"
--   (해당 행이 0건이면 이 검사는 "확인 불가"다. 음성으로 적지 말 것)
--
-- 위 양성 2 를 돌렸으면 되돌린다:
-- UPDATE public.case_evidence SET observation_key=NULL WHERE url LIKE '%chwy-20240128%';


-- ============================================================
-- (4) 백필 지침 — 실행은 사람이, 검토 후에
-- ============================================================
--
-- ★ 키를 짓는 규칙. 규약이 없으면 사람마다 다르게 지어서 축이 무의미해진다.
--
--   형식:  <발행주체>-<문서종류>-<기간>     모두 소문자·하이픈
--   예:    chwy-10k-fy2023 / duol-8k-2023q2 / sensortower-panel-2023q3
--
--   ★ 기준은 매체가 아니라 **관측**이다. 판정 질문 한 문장:
--     "이 행이 사라지면 우리가 잃는 관측이 무엇인가."
--     다른 행과 **같은 것**을 잃으면 같은 키다. Retail Dive 기사는 사라져도
--     10-K 가 남으면 잃는 게 없다 → 10-K 와 같은 키.
--     Sensor Tower 패널 측정은 사라지면 회사 밖 측정치를 통째로 잃는다 → 다른 키.
--
--   ★ 옮겨 적었는지 아닌지는 **본문이 말해 준다.** "according to the company",
--     "회사에 따르면", "실적발표에서 밝혔다" 가 있으면 옮겨 적은 것이다.
--     9차에 확보한 Retail Dive 원문이 정확히 그 예다 —
--     "according to newly minted CFO David Reeder".
--
-- ★ supports_metric 은 무브의 metric_name 을 보고 정한다.
--   그 수치가 근거 본문에 있으면 true, 없으면 false.
--
-- 아래는 9차까지 확인된 것만 적었다. 나머지는 확인 후 추가할 것 —
-- **모르는 행을 false 나 임의 키로 채우지 말 것.** NULL 이 "확인 안 함"의 정직한 표기다.
--
-- BEGIN;
--
-- -- Chewy FY2023 10-K 를 원 관측으로 하는 행들 (원문 + 그것을 받아쓴 기사)
-- UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023'
--  WHERE url LIKE '%sec.gov/Archives/edgar/data/1766502/000176650224000014%';
-- UPDATE public.case_evidence SET observation_key='chwy-10k-fy2023'
--  WHERE url LIKE '%retaildive.com/news/chewy-sales-gain%';
--   -- ↑ L-61 에서 원문을 확보해 확인했다. 이 기사는 76% 를 CFO 발언으로,
--   --   활성고객 수를 SEC 제출 문서로 귀속한다. 독립 도메인이지 독립 관측이 아니다.
--   --   ⚠️ 이 두 줄이 chewy/PACKAGING 을 B → C 로 내린다. 의도한 결과다.
--
-- -- Duolingo 8-K(2023 Q2) 와 그 IR 보도자료
-- UPDATE public.case_evidence SET observation_key='duol-8k-2023q2'
--  WHERE url LIKE '%sec.gov/Archives/edgar/data/1562088%';
-- UPDATE public.case_evidence SET observation_key='duol-ir-2023q4'
--  WHERE url LIKE '%investors.duolingo.com/news-releases%';
--
-- -- Sensor Tower 자체 패널 측정 (9차 추가). 회사 발표와 다른 관측이다.
-- UPDATE public.case_evidence SET observation_key='sensortower-panel-2023q3'
--  WHERE url LIKE '%sensortower.com/blog/monday-mobile-memo-2023-11-13%';
--
-- -- supports_metric: 9차에 본문까지 확인한 행만
-- UPDATE public.case_evidence SET supports_metric=true
--  WHERE url LIKE '%retaildive.com/news/chewy-sales-gain%';          -- "about 76%" 본문에 있음
-- UPDATE public.case_evidence SET supports_metric=true
--  WHERE url LIKE '%sensortower.com/blog/monday-mobile-memo-2023-11-13%'; -- DAU 증가율 본문에 있음
--
-- COMMIT;
--
-- 백필 후 반드시:
--   node --env-file=.env.local scripts/case-pipeline-verify.mjs --probe
--   node --env-file=.env.local scripts/case-review.mjs regrade --dry
--   (드라이런으로 몇 개가 어떻게 움직이는지 본 뒤에 실반영할 것)
