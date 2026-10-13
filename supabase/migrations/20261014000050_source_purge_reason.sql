-- ============================================================
-- 20261014000050_source_purge_reason — v70 D5: analysis_inputs.purge_reason 허용 값에 'source_purge' 추가
--
-- ⛔ 미적용 상태로 PR 에 올린다. 적용은 머지 뒤 오케스트레이터가 한다(CLAUDE.md §10.2).
-- 근거: v70 §1 안전선("소스 단위 일괄 purge 가능한 구조 유지") · §0 D5(소스 단위 purge 시험). 코드 짝: scripts/source-purge.mjs(+selftest).
-- 왜 DDL: 기존 CHECK 가 ('retention','dedupe') 만 허용해 소스 단위 purge 가 사유를 못 쓴다. 'source_purge' 를 더해 retention·dedupe 집계와 섞이지 않게 한다.
--
-- 🟢 비파괴: CHECK 를 넓힐 뿐이라 기존 행은 모두 통과한다. 데이터 변경 0. 같은 트랜잭션에서 DROP → ADD(잠깐의 검사 공백 없음).
--   analysis_inputs 79,5k행 — ADD CONSTRAINT 가 전체 행을 검사하므로 짧은 테이블 락이 생긴다(읽기 허용, 쓰기 대기). 수집 슬롯 사이에 적용한다.
-- 롤백: 20261014000050_source_purge_reason_rollback.sql (source_purge 행이 없을 때만 성공 — 있으면 RAISE)
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'analysis_inputs_purge_reason_check';   -- 기대: ... ARRAY['retention','dedupe']
--   SELECT purge_reason, count(*) FROM public.analysis_inputs GROUP BY 1;                                       -- 기대: NULL / retention / dedupe 만

BEGIN;

ALTER TABLE public.analysis_inputs DROP CONSTRAINT analysis_inputs_purge_reason_check;
ALTER TABLE public.analysis_inputs ADD CONSTRAINT analysis_inputs_purge_reason_check
  CHECK (purge_reason IS NULL OR purge_reason = ANY (ARRAY['retention'::text, 'dedupe'::text, 'source_purge'::text]));

DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'analysis_inputs_purge_reason_check' AND conrelid = 'public.analysis_inputs'::regclass) NOT LIKE '%source_purge%' THEN
    RAISE EXCEPTION 'purge_reason CHECK 에 source_purge 가 없다';
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'analysis_inputs_purge_reason_check';   -- source_purge 포함
-- 음성(롤백되는 형태): BEGIN; UPDATE public.analysis_inputs SET purge_reason = 'nope', purged_at = now() WHERE id = (SELECT id FROM public.analysis_inputs LIMIT 1); ROLLBACK;   -- 기대: 23514
