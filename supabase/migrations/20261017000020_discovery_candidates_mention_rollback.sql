-- ============================================================
-- 20261017000020_discovery_candidates_mention — 롤백
--
-- 🔴 파괴적이다. 언급 루프 대장 칸(글 수·근거 id·영역 적합·게이트 차단)이 사라진다. 사람·역할 세션만 실행한다(CLAUDE.md §10.2).
-- 먼저 지울 것(남길 거면 아래 SELECT 를 저장): 언급 루프가 넣은 행 자체는 이 롤백이 지우지 않는다 —
--   SELECT id, name, verdict, verdict_reason, post_count, evidence_input_ids, area_code, area_fit, gate_blocked
--     FROM public.discovery_candidates WHERE origin = 'mention';
--   행까지 지우려면(되돌리기 어려운 삭제 — §10.2 예외 1, 사람 판단): DELETE FROM public.discovery_candidates WHERE origin = 'mention';
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.discovery_candidates_origin_idx;
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_mention_accept_check;
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_gate_blocked_check;
ALTER TABLE public.discovery_candidates DROP CONSTRAINT IF EXISTS discovery_candidates_origin_check;
ALTER TABLE public.discovery_candidates
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS mention_count,
  DROP COLUMN IF EXISTS post_count,
  DROP COLUMN IF EXISTS source_count,
  DROP COLUMN IF EXISTS alt_seek_posts,
  DROP COLUMN IF EXISTS evidence_input_ids,
  DROP COLUMN IF EXISTS area_code,
  DROP COLUMN IF EXISTS area_fit,
  DROP COLUMN IF EXISTS gate_blocked,
  DROP COLUMN IF EXISTS last_seen_at;

COMMIT;
