-- ============================================================
-- 20260930000005_transferability_reason_rollback
--
-- 위 마이그레이션을 되돌린다.
--
-- ⚠️ 이 파일은 DROP COLUMN 이다 — CLAUDE.md §10.2 "되돌리기 어려운 삭제"에 해당하므로
--    **사람만** 실행한다. 세션이 자체 판단으로 돌리지 않는다.
--    돌리면 그동안 사람이 적은 이식성 사유가 사라진다. 먼저 내려받아 둔다:
--      SELECT id, transferability, transferability_reason, transferability_reason_at
--        FROM public.case_moves WHERE transferability_reason IS NOT NULL;
-- ============================================================

BEGIN;

ALTER TABLE public.case_moves
  DROP CONSTRAINT IF EXISTS case_moves_transferability_reason_len;

ALTER TABLE public.case_moves
  DROP COLUMN IF EXISTS transferability_reason,
  DROP COLUMN IF EXISTS transferability_reason_at;

COMMIT;

-- 확인 — 기대: 0행.
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='case_moves'
--      AND column_name IN ('transferability_reason','transferability_reason_at');
