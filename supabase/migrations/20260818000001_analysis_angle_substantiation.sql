-- ============================================================
-- 실증 게이트(judge) 판정 근거를 analysis_angles 에 영속화
--
-- 배경: 실증 판정이 writer 자기 채점에서 별도 judge LLM 호출로 분리되면서
--   "왜 그렇게 판정했는가"와 "게이트가 실제로 작동했는가"가 중요해졌다.
--   현재는 그 정보가 HTTP 응답에만 실려 요청이 끝나면 사라진다.
--   판정 근거가 DB 에 없으면 (1) 경험담 우회 재발을 사후 추적할 수 없고
--   (2) SUBSTANTIATED 인용이 원문에 실재하는지 SQL 로 검증할 수 없다.
--
-- 저장되는 값의 출처 (app/api/analyze/angle/route.ts):
--   substantiation_reason   ← judge/re-judge 응답의 reason
--   substantiation_evidence ← judge 응답의 evidence_quote (원문 그대로 인용)
--   headline_original       ← 재작성 전 문구 (재작성 없으면 null)
--   gate_rewritten          ← 재작성 경로를 탔는지
--
-- 기존 데이터 영향: 전부 nullable ADD COLUMN. 기존 행은 신규 컬럼이 null/false 가
--   될 뿐 CHECK 위반이 없다. NOT NULL 도, CHECK 변경도, 인덱스 변경도 없다.
--   운영 중 무중단 적용 가능.
--
-- ⚠️ 배포 순서: 이 마이그레이션을 **먼저** 적용한 뒤 코드를 배포한다.
--   순서가 뒤집히면 신규 컬럼을 포함한 INSERT 가 PostgREST 스키마 캐시에서
--   PGRST204(또는 42703 undefined_column)로 전부 실패한다.
--
-- 가역: 동명 rollback 파일 참조(20260818000001_analysis_angle_substantiation_rollback.sql).
-- ============================================================

-- ── 판정 근거 컬럼 ───────────────────────────────────────────
ALTER TABLE public.analysis_angles
  ADD COLUMN IF NOT EXISTS substantiation_reason text;

ALTER TABLE public.analysis_angles
  ADD COLUMN IF NOT EXISTS substantiation_evidence text;

-- ── 게이트 작동 흔적 컬럼 ────────────────────────────────────
ALTER TABLE public.analysis_angles
  ADD COLUMN IF NOT EXISTS headline_original text;

-- DEFAULT false 라 기존 행도 즉시 false 로 읽힌다. NOT NULL 은 걸지 않는다 —
-- 이 마이그레이션 이전에 만들어진 행은 "재작성 안 함"이 아니라 "알 수 없음"이고,
-- 나중에 NOT NULL 로 조이려면 백필이 선행돼야 하기 때문.
ALTER TABLE public.analysis_angles
  ADD COLUMN IF NOT EXISTS gate_rewritten boolean DEFAULT false;

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON COLUMN public.analysis_angles.substantiation_reason IS
  'judge 가 이 verdict 를 내린 사유 한 줄. 재작성된 건은 re-judge 의 사유가 들어간다.';
COMMENT ON COLUMN public.analysis_angles.substantiation_evidence IS
  'SUBSTANTIATED 판정의 근거로 judge 가 analysis_inputs.raw_text 에서 그대로 인용한 문장. '
  'SUBSTANTIATED 가 아니면 null. 코드가 원문 포함 여부를 검사해 미존재 시 UNSUBSTANTIATED 로 강등한다.';
COMMENT ON COLUMN public.analysis_angles.headline_original IS
  '실증 게이트에 걸려 재작성되기 전의 원래 문구. 재작성이 없었으면 null.';
COMMENT ON COLUMN public.analysis_angles.gate_rewritten IS
  '실증 게이트가 발동해 불안 해소 장치로 재작성됐는지 여부. '
  'true 인 행의 substantiation_verdict 는 재작성문에 대한 re-judge 결과다.';
