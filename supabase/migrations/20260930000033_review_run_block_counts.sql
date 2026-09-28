-- ============================================================
-- 20260930000033_review_run_block_counts
--
-- `review_collection_runs` 에 차단(403/429)·쿼터 소진 응답 **건수** 컬럼 2개.
--
-- 왜: 수집 속도 점진 인상 정책(reports/2026-09-28/cowork-four-orders.md §2-2, 남헌 2026-09-28 확정)의
--   되돌리기 조건 1번이 "차단 1건"이다. 지금 이 숫자는 `scripts/review-collect.mjs` 의
--   로그·Notion 줄에만 찍히고 DB 에 없다 — broken 이력으로 거꾸로 추정할 수밖에 없다.
--   그러면 "차단 0건이었다"와 "센 적이 없다"가 구별되지 않는다(CLAUDE.md §7.1).
--
-- 값: lib/review/runner.ts 의 stats.blockedResponses / stats.quotaExhaustedResponses 그대로.
--   · blocked_responses = 상대가 막은 응답(403/429, 쿼터 소진 제외)
--   · quota_responses   = 공식 API 쿼터 소진(차단 아님, 다음 실행에서 재개)
--
-- ⚠️ 이 컬럼이 생기기 전 행은 DEFAULT 0 으로 채워진다 = **측정 안 함**이지 "차단 0건"이 아니다.
--    램프 엔진은 이 마이그 적용 시각 이전 실행을 판정 창에 넣지 마라(started_at 으로 자른다).
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 2개(상수 DEFAULT 라 PG11+ 에서 테이블 재작성 없음).
--    기존 행·제약·다른 컬럼을 건드리지 않고 백필도 없다. 롤백 파일 있음.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음.
--
-- 미적용이어도 수집은 돈다: 러너가 42703/PGRST204 를 받으면 두 필드만 빼고 저장하고
--   "카운트 미저장" 경고를 찍는다(lib/review/run-log.ts — 조용히 성공으로 접지 않는다).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 절차:
--   1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인
--   2) information_schema 로 부재 확인 3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
-- ============================================================

BEGIN;

ALTER TABLE public.review_collection_runs
  ADD COLUMN IF NOT EXISTS blocked_responses integer NOT NULL DEFAULT 0
    CONSTRAINT review_collection_runs_blocked_responses_check CHECK (blocked_responses >= 0),
  ADD COLUMN IF NOT EXISTS quota_responses integer NOT NULL DEFAULT 0
    CONSTRAINT review_collection_runs_quota_responses_check CHECK (quota_responses >= 0);

COMMENT ON COLUMN public.review_collection_runs.blocked_responses IS
  '차단 응답(403/429, 쿼터 소진 제외) 건수. 마이그 20260930000033 이전 행의 0 은 측정 안 함.';
COMMENT ON COLUMN public.review_collection_runs.quota_responses IS
  '공식 API 쿼터 소진 응답 건수(차단 아님). 마이그 20260930000033 이전 행의 0 은 측정 안 함.';

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_collection_runs'
--    AND column_name IN ('blocked_responses','quota_responses');   -- 기대: 2행, integer, NO, 0
-- 음성(롤백되는 형태):
-- BEGIN; UPDATE public.review_collection_runs SET blocked_responses = -1
--         WHERE id = (SELECT id FROM public.review_collection_runs LIMIT 1); ROLLBACK;  -- 기대: 23514
-- 첫 실수집 뒤: 새 행이 쓰였는지(0 이어도 행의 started_at 이 적용 시각 이후면 측정된 0 이다)
-- SELECT source_key, started_at, blocked_responses, quota_responses
--   FROM public.review_collection_runs ORDER BY started_at DESC LIMIT 20;
