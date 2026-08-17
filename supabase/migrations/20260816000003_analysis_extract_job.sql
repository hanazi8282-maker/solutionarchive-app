-- ============================================================
-- 소구점 추출을 동기 호출에서 큐+폴링 방식으로 바꾸기 위한 스키마 확장
-- 1) status CHECK 에 processing / failed 추가 (기존 값 전부 포함하는 확장)
-- 2) analysis_projects 에 잡 추적 컬럼 4종 추가 (순수 ADD COLUMN)
--
-- 상태 흐름:
--   collecting → processing → extracted → reviewed → ...
--                     └────→ failed → (재시도) → processing
--
-- 기존 데이터 영향: status 허용값이 넓어지기만 하므로 현재 행은 전부 통과한다.
-- 가역: 동명 rollback 파일 참조(20260816000003_analysis_extract_job_rollback.sql).
-- ============================================================

-- ── 1) status CHECK 확장 ─────────────────────────────────────
-- 인라인 컬럼 CHECK 는 <table>_<column>_check 로 자동 명명된다.
-- 새 제약을 먼저 만들 수 없으므로(같은 컬럼에 중복 CHECK 가 남음) DROP 후 ADD 한다.
ALTER TABLE public.analysis_projects
  DROP CONSTRAINT IF EXISTS analysis_projects_status_check;

ALTER TABLE public.analysis_projects
  ADD CONSTRAINT analysis_projects_status_check
  CHECK (status IN (
    'collecting',   -- 원문 수집 단계 (기본값)
    'processing',   -- 추출 진행 중 (신규)
    'extracted',    -- 추출 완료, 사람 검수 대기
    'failed',       -- 추출 실패, 재시도 가능 (신규)
    'scored',
    'reviewed',
    'angled',
    'done'
  ));

-- ── 2) 잡 추적 컬럼 ──────────────────────────────────────────
ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS extract_started_at timestamptz;

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS extract_finished_at timestamptz;

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS extract_error text;

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS extract_attempts int NOT NULL DEFAULT 0;

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON COLUMN public.analysis_projects.extract_started_at IS
  '추출 잡 시작 시각. processing 상태에서 10분 이상 지나면 죽은 잡으로 보고 재시도를 허용한다.';
COMMENT ON COLUMN public.analysis_projects.extract_finished_at IS
  '추출 잡 종료 시각(성공/실패 공통). 소요시간 측정용.';
COMMENT ON COLUMN public.analysis_projects.extract_error IS
  '마지막 추출 실패 원인. 성공 시 null 로 초기화한다.';
COMMENT ON COLUMN public.analysis_projects.extract_attempts IS
  '추출 시도 횟수(재시도 포함).';
