-- ============================================================
-- 20260908000001_agent_ops
--
-- 무인 에이전트 루프의 **가시화 정본** 2테이블.
--   agent_runs ──1:N── agent_run_steps
--
-- ⚠️ 이 마이그레이션은 아직 **적용되지 않았다.** 사람이 적용한다:
--     supabase db query --linked -f supabase/migrations/20260908000001_agent_ops.sql
--   (또는 대시보드 SQL Editor. 프로젝트 ref: qmgrfqjfxqhxuufrnkwf)
--   §12-5 상 무인 루프에는 마이그레이션 적용 권한이 없다.
--
-- 왜 파일(reports/)이 아니라 DB 가 정본인가
--   `$GITHUB_STEP_SUMMARY` 는 90일 뒤 사라지고, `reports/status/DASHBOARD.md` 는
--   커밋이 성공해야 남는다. 그런데 **커밋 실패 자체가 가장 알고 싶은 사건**이다.
--   커밋 이전 단계에서 죽은 실행은 파일 표면에 한 줄도 안 남는다. 그래서 진행
--   상태는 매 스텝 DB 에 쓰고, 파일 세 표면은 그 위의 렌더 결과로만 둔다.
--   DB 에 못 닿으면 `ops/state/<run_key>.jsonl` 로 폴백하되, 렌더러가
--   "DB 확인 불가 — 로컬 기준"을 화면에 박는다 (§7.1: 확인 실패 ≠ 정상).
--
-- ★ status 를 4종이 아니라 6종으로 쪼갠 이유
--   `skipped` / `failed` / `blocked` 를 하나로 접으면, "할 일이 없어서 넘어감"과
--   "게이트가 막았다"와 "터졌다"가 같은 색으로 보인다. 셋은 다음 행동이 전부 다르다.
--   특히 `blocked` 는 **정상 동작**이다(CG-1 이 등급 C 초안을 막은 경우 등) —
--   실패로 세면 아침마다 가짜 경보가 뜨고, 성공으로 세면 §7.2 위반이다.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) agent_runs — 실행 1회
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 멱등 키. `cmo-2026-09-08-01` 처럼 부서+날짜+회차로 만든다.
  -- 같은 실행이 재시도돼도 행이 늘지 않게 UNIQUE 로 못박는다.
  run_key     text NOT NULL UNIQUE,

  dept        text NOT NULL CHECK (dept IN ('cmo', 'cto', 'ceo-staff')),
  trigger     text NOT NULL CHECK (trigger IN ('cron', 'manual', 'local')),

  -- running 으로 시작해 끝날 때 갱신된다. `running` 인 채 5분 넘게 안 바뀌면
  -- 렌더러가 stale 로 표시한다 — "돌고 있다"와 "죽어서 멈췄다"는 다른 사건이다.
  status      text NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'ok', 'partial', 'failed', 'blocked')),

  -- ★ dry_run 실행도 기록한다. 안 남기면 "어젯밤 왜 아무것도 안 바뀌었나"에
  --   답을 못 한다. 대신 이 플래그가 true 인 실행은 소비 쪽에서 성과 집계에 넣지 않는다.
  dry_run     boolean NOT NULL DEFAULT false,

  git_sha     text,
  run_url     text,

  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,

  -- 집계 스냅샷(조사 N건 / 초안 N건 / 막힌 N건 …). 스텝을 다시 접지 않고
  -- 읽을 수 있게 두는 캐시다. 정본은 agent_run_steps 다.
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT agent_runs_finish_order
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

COMMENT ON TABLE public.agent_runs IS
  '무인 에이전트 실행 1회. 진행 가시화의 정본. reports/ 파일은 이걸 렌더한 결과다.';
COMMENT ON COLUMN public.agent_runs.run_key IS
  '멱등 키 (dept-YYYY-MM-DD-NN). 재시도해도 행이 늘지 않게 UNIQUE.';
COMMENT ON COLUMN public.agent_runs.dry_run IS
  'true 면 DB 쓰기·커밋을 하지 않은 실행. 성과 집계에서 뺀다.';

CREATE INDEX IF NOT EXISTS agent_runs_dept_idx
  ON public.agent_runs (dept, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx
  ON public.agent_runs (status, started_at DESC);


-- ────────────────────────────────────────────────────────────
-- 2) agent_run_steps — 단계 1개
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,

  -- 화면 정렬용. 스텝은 순차 실행이라 seq 가 곧 시간 순서다.
  seq         int NOT NULL,

  -- 'preflight' / 'queue' / 'research' / … 코드에서 쓰는 안정 키.
  step_key    text NOT NULL,
  -- 사람이 읽는 이름. 키를 바꾸지 않고 문구만 고칠 수 있게 분리한다.
  label       text NOT NULL,

  status      text NOT NULL DEFAULT 'running'
                CHECK (status IN ('pending', 'running', 'ok', 'skipped', 'failed', 'blocked')),

  -- {researched: 2, drafted: 2, gate_blocked: 1} 같은 수치. 개수 없이
  -- 'ok' 만 남기면 "0건 성공"과 "2건 성공"이 같은 초록불이 된다 (§7.1).
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- blocked 일 때 **무엇이 막았는지**. 아래 CHECK 로 필수화한다.
  blocker     text,

  -- 실패 메시지·경로·exit code 등 자유 형식.
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,

  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- 같은 실행 안에서 같은 스텝을 두 번 쓰지 않는다. 재시도는 UPDATE 다.
  CONSTRAINT agent_run_steps_unique_step UNIQUE (run_id, step_key),

  -- ★ 이유 없는 blocked 를 막는다. 사유 없이 막힌 스텝은 다음 날 아침에
  --   "왜 막혔지"를 아무도 복원하지 못하고, 결국 무시된다.
  CONSTRAINT agent_run_steps_blocked_needs_blocker
    CHECK (status <> 'blocked' OR (blocker IS NOT NULL AND length(btrim(blocker)) > 0))
);

COMMENT ON TABLE public.agent_run_steps IS
  '실행 단계 1개. skipped/failed/blocked 를 분리해 기록한다 — 셋은 다음 행동이 다르다.';
COMMENT ON COLUMN public.agent_run_steps.status IS
  'blocked 는 실패가 아니라 안전장치가 정상 작동한 상태다. 성공으로도 세지 않는다 (§7.2).';
COMMENT ON COLUMN public.agent_run_steps.blocker IS
  'blocked 일 때 필수. 무엇이 막았는가 (예: CG-1 귀속 문구 없음).';

CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx
  ON public.agent_run_steps (run_id, seq);

COMMIT;


-- ============================================================
-- 검증 쿼리 (적용 직후 — 양성/음성 둘 다 돌린다)
--
-- ⚠️ "에러 안 났다"로 통과 처리하지 않는다. 막아야 할 것이 막히는지 본다.
-- ============================================================
--
-- ── 양성 1) 2테이블이 생겼는가
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('agent_runs','agent_run_steps');
--   기대: 2행
--
-- ── 양성 2) 정상 INSERT
-- INSERT INTO public.agent_runs (run_key, dept, trigger) VALUES ('__probe__','cmo','manual');
--   기대: 성공. status='running', dry_run=false
--
-- ── 음성 1) 어휘 밖 dept 는 거절돼야 한다
-- INSERT INTO public.agent_runs (run_key, dept, trigger) VALUES ('__probe2__','sales','manual');
--   기대: ERROR 23514 agent_runs_dept_check
--
-- ── 음성 2) blocked 인데 blocker 가 없으면 거절돼야 한다
-- INSERT INTO public.agent_run_steps (run_id, seq, step_key, label, status)
--   SELECT id, 1, 'gate', '게이트', 'blocked' FROM public.agent_runs WHERE run_key='__probe__';
--   기대: ERROR 23514 agent_run_steps_blocked_needs_blocker
--
-- ── 음성 3) blocker 가 공백뿐이어도 거절돼야 한다
-- INSERT INTO public.agent_run_steps (run_id, seq, step_key, label, status, blocker)
--   SELECT id, 1, 'gate', '게이트', 'blocked', '   ' FROM public.agent_runs WHERE run_key='__probe__';
--   기대: ERROR 23514 (같은 제약)
--
-- ── 음성 4) 같은 실행에 같은 step_key 두 번은 거절돼야 한다
-- INSERT INTO public.agent_run_steps (run_id, seq, step_key, label)
--   SELECT id, 1, 'preflight', '사전점검' FROM public.agent_runs WHERE run_key='__probe__';
-- INSERT INTO public.agent_run_steps (run_id, seq, step_key, label)
--   SELECT id, 2, 'preflight', '사전점검' FROM public.agent_runs WHERE run_key='__probe__';
--   기대: 첫 번째 성공 / 두 번째 ERROR 23505 agent_run_steps_unique_step
--
-- ── 정리
-- DELETE FROM public.agent_runs WHERE run_key LIKE '\_\_probe%';
-- SELECT count(*) FROM public.agent_runs WHERE run_key LIKE '\_\_probe%';   -- 기대: 0


-- ============================================================
-- 거부한 대안 — 지우지 않고 남긴다
-- ============================================================
--
-- (A) agent_runs 한 테이블 + steps jsonb 배열
--     스텝을 배열로 넣으면 갱신이 read-modify-write 라 동시성에 취약하고,
--     "지금 어느 스텝인가"를 인덱스로 못 뽑는다. 무엇보다 스텝 단위 UNIQUE 를
--     못 걸어 재시도가 배열을 부풀린다.
--
-- (B) status 를 boolean ok 하나로
--     이 리포가 반복해 잡은 사고의 원형이다. blocked(안전장치 작동) 와
--     skipped(할 일 없음) 와 failed(사고) 가 같은 false 가 된다.
--
-- (C) 기존 insight_runs 류 테이블에 dept 컬럼만 추가해 재사용
--     인사이트 루프와 스텝 어휘·수명주기가 다르다. 한 테이블에 섞으면 두
--     파이프라인의 CHECK 어휘가 서로를 넓히는 방향으로만 자란다.
--
-- (D) reports/status/DASHBOARD.md 만 두고 DB 를 안 만들기
--     커밋 전에 죽은 실행이 어디에도 안 남는다. 그게 가장 알고 싶은 사건이다.
