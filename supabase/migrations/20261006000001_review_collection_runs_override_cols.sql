-- ============================================================
-- 20261006000001_review_collection_runs_override_cols
--
-- `review_collection_runs` 에 robots 예외 사용 기록 컬럼 3개 (남헌 v23 4 · Q4 승인 A안,
--   reports/2026-10-06/design-report-v22.md §4).
--
-- 왜: 소유자 예외(review_sources.override='owner_2026-10-05')는 남헌이 날짜 붙여 연 것이다. "그 예외로 실제 몇 요청을
--   보냈나"가 실행 요약(Actions 로그 90일)에만 있으면 예외를 유지·회수할 근거가 사라진다. 차단 건수를 DB 로 옮긴
--   이유(20260930000033 머리말)와 같다.
--
-- 값(lib/review/runner.ts RunResult → scripts/review-collect.mjs → lib/review/run-log.ts finishRunRow):
--   · robots_owner_override = robots **금지**인데 소유자 예외로만 보낸 요청 수(RunResult.robotsOwnerOverride)
--   · robots_bypassed       = robots 를 못 읽었는데 어댑터 표식(proceedWhenRobotsUnverified)으로만 보낸 요청 수
--   · override_value        = 그 실행 시점 review_sources.override 스냅샷. NULL = 예외 없음.
--       한 행 = 소스 1개 = loadSource 1회라 값은 구조상 1개다(run-log.ts 주석). 나중에 review_sources.override 를
--       NULL 로 되돌려도 "어느 실행이 어떤 예외로 돌았나"가 여기 남는다.
--
-- ⚠️ 이 컬럼이 생기기 전 행은 DEFAULT 0 / NULL = **측정 안 함**이지 "예외 사용 0건"이 아니다(COMMENT 에도 적는다).
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 3개(상수 DEFAULT 라 PG11+ 에서 테이블 재작성 없음).
--    기존 행 UPDATE·백필 없음, 다른 컬럼·제약 안 건드림. 롤백 파일 있음(DROP COLUMN — 사람 판단).
--    CLAUDE.md §10.2 사람 판단 예외 해당 없음.
--
-- 미적용이어도 수집은 돈다: finishRunRow 가 42703/PGRST204 를 받고 메시지에 이 세 컬럼 이름이 있으면 세 필드만 빼고
--   저장하고 경고를 찍는다. 그 실행(프로세스) 동안 기억해서 다음 소스부터는 처음부터 뺀다.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 절차:
--   1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인
--   2) information_schema 로 부재 확인 3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
-- ============================================================

BEGIN;

ALTER TABLE public.review_collection_runs
  ADD COLUMN IF NOT EXISTS robots_owner_override integer NOT NULL DEFAULT 0
    CONSTRAINT review_collection_runs_robots_owner_override_check CHECK (robots_owner_override >= 0),
  ADD COLUMN IF NOT EXISTS robots_bypassed integer NOT NULL DEFAULT 0
    CONSTRAINT review_collection_runs_robots_bypassed_check CHECK (robots_bypassed >= 0),
  ADD COLUMN IF NOT EXISTS override_value text NULL;

COMMENT ON COLUMN public.review_collection_runs.robots_owner_override IS
  'robots 금지인데 소유자 예외(review_sources.override)로만 보낸 요청 수. 마이그 20261006000001 이전 행의 0 은 측정 안 함.';
COMMENT ON COLUMN public.review_collection_runs.robots_bypassed IS
  'robots 를 못 읽었는데 어댑터 표식(proceedWhenRobotsUnverified)으로만 보낸 요청 수. 마이그 20261006000001 이전 행의 0 은 측정 안 함.';
COMMENT ON COLUMN public.review_collection_runs.override_value IS
  '실행 시점 review_sources.override 스냅샷(<주체>_<YYYY-MM-DD>). NULL = 예외 없음 또는 마이그 20261006000001 이전 행(측정 안 함).';

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_collection_runs'
--    AND column_name IN ('robots_owner_override','robots_bypassed','override_value');
--   기대: 3행 — integer/NO/0, integer/NO/0, text/YES/NULL
-- 음성(롤백되는 형태):
-- BEGIN; UPDATE public.review_collection_runs SET robots_owner_override = -1
--         WHERE id = (SELECT id FROM public.review_collection_runs LIMIT 1); ROLLBACK;  -- 기대: 23514
-- 첫 실수집 뒤(appstore 는 소유자 예외 소스):
-- SELECT source_key, started_at, robots_owner_override, robots_bypassed, override_value
--   FROM public.review_collection_runs ORDER BY started_at DESC LIMIT 20;
--   기대: appstore 행 override_value='owner_2026-10-05', robots 금지 판정이면 robots_owner_override = 그 실행 요청 수
