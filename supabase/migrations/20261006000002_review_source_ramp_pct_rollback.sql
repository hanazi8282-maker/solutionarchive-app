-- ============================================================
-- 20261006000002_review_source_ramp_pct — 롤백
--
-- 🔴 파괴적이다. 퍼센트 램프 상태(단계·연속 정상 일수·차단선)와 로그의 pct 이력이 사라지고 재생성 경로가 없다.
--    CLAUDE.md §10.2 예외 1번 "되돌리기 어려운 삭제" — 사람만 실행한다.
-- 지우기 전에 남길 것:
--   SELECT * FROM public.review_source_ramp WHERE cap_base IS NOT NULL;
--   SELECT * FROM public.review_source_ramp_log WHERE event IS NOT NULL ORDER BY created_at;
-- 롤백 뒤에도 수집은 돈다 — loadSourceRamp 가 컬럼 없음(42703/PGRST204)을 받고 옛 칸(타깃 수 계단)만 읽는다.
-- 코드만 되돌리려면 이 파일 대신 PR revert 로 충분하다(칸이 남아도 옛 코드는 읽지 않는다).
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.review_source_ramp_log_block_idx;

ALTER TABLE public.review_source_ramp_log
  DROP CONSTRAINT IF EXISTS review_source_ramp_log_event_check,
  DROP CONSTRAINT IF EXISTS review_source_ramp_log_pct_check,
  DROP COLUMN IF EXISTS event,
  DROP COLUMN IF EXISTS new_pct,
  DROP COLUMN IF EXISTS prev_pct;

ALTER TABLE public.review_source_ramp
  DROP COLUMN IF EXISTS is_stable,
  DROP COLUMN IF EXISTS supply_state,
  DROP COLUMN IF EXISTS blocks_at_step,
  DROP COLUMN IF EXISTS block_line_at,
  DROP COLUMN IF EXISTS block_line,
  DROP COLUMN IF EXISTS last_evaluated_date,
  DROP COLUMN IF EXISTS consecutive_ok_days,
  DROP COLUMN IF EXISTS daily_request_target,
  DROP COLUMN IF EXISTS cap_base,
  DROP COLUMN IF EXISTS pct_step;
-- 칸에 걸린 CHECK 제약은 DROP COLUMN 과 함께 사라진다.

COMMIT;

-- 확인
-- SELECT table_name, count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name IN ('review_source_ramp','review_source_ramp_log')
--  GROUP BY 1;                                               -- 기대: ramp 6 · ramp_log 7 (000034 상태)
