-- ============================================================
-- 20260930000035_discovery_transfer_gate — 롤백
--
-- 🔴 파괴적이다. 이식성 판정과 사람 무효화 사유가 사라진다. 사람만 실행한다(CLAUDE.md §10.2).
-- 먼저 코드(discovery-run · /discovery · notion digest)를 되돌리고 돌린다 — 코드가 이 컬럼을 읽고 쓴다.
-- 지우기 전에 남길 것:
--   SELECT id, name, transfer_verdict, transfer_lesson, transfer_reason, human_note
--     FROM public.discovery_candidates
--    WHERE transfer_verdict IS NOT NULL OR human_note IS NOT NULL;
-- ============================================================

BEGIN;

ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_transfer_verdict_check;
ALTER TABLE public.discovery_candidates
  DROP COLUMN IF EXISTS transfer_verdict,
  DROP COLUMN IF EXISTS transfer_lesson,
  DROP COLUMN IF EXISTS transfer_reason,
  DROP COLUMN IF EXISTS human_note;

COMMIT;
