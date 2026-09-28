-- 경쟁사 프로필 스냅샷 (competitor_profile_snapshots)
--
-- 근거: 남헌 2026-09-29 — 경쟁사 프로필링 원칙을 기존 VOC 데이터만으로 이식(외부 API 없음).
--   프로젝트(경쟁사) 1건 = 재합성 1회마다 행 1개(날짜 붙은 스냅샷 = 버전). extract 성공 직후 생성(lib/analysis/extract-run.ts 9단계),
--   기존 프로젝트는 scripts/competitor-profile-backfill.mjs 로 소급. prompt_version 이 코드(lib/analysis/competitor-profile.ts
--   PROFILE_PROMPT_VERSION)와 다르면 백필이 다시 만든다.
--
-- sections(jsonb) 모양 — 코드가 근거를 단다(모델은 원문 번호만 낸다):
--   { "at_a_glance": [{ "claim": "...", "evidence": [{ "input_id": "<uuid>", "label": "Hacker News · 3f2a1c9b", "link": "https://…"|null }] }],
--     "positioning": [...], "pricing": [...], "strengths": [...], "weaknesses": [...], "implications": [...] }
--   evidence.input_id 는 analysis_inputs.id 다. FK 로 묶지 않는다 — 원문이 폐기(raw_text NULL)돼도 "그 원문 id 가 근거였다"는 기록은 남아야 한다.
--
-- status 3상태: ok(필수 섹션 전부·버린 주장 0) · unverified(내용은 있으나 빈 필수 섹션·근거 없는 주장 버림 — 표식 달고 표시) ·
--   failed(쓸 만한 주장 0·호출 실패 — sections NULL, fail_reason 만). CHECK 가 "failed 인데 본문 있음/ok 인데 본문 없음"을 막는다.
--
-- 🟢 비파괴. 신규 테이블 1개(CREATE TABLE IF NOT EXISTS) + 인덱스 1개. 기존 테이블의 행·컬럼은 건드리지 않는다. 트리거·함수 없음.
--    롤백 파일 있음(`_rollback.sql` — 테이블 DROP, 스냅샷만 사라진다. 다시 적용하면 백필이 다시 만든다).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 행 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260915000002). 앱은 service_role 로만 읽는다.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 미적용이어도 추출·화면은 돈다 —
--   extract 뒤 프로필 단계가 "저장 실패(42P01)" 로 agent_run_steps 에 남고, /analyze/[id]/result 카드에 "미적용(마이그 000037 전)" 만 뜬다.
--   절차: 1) solutionarchive qmgrfqjfxqhxuufrnkwf 확인 2) information_schema 로 부재 확인 3) 실행 → 하단 확인 쿼리
--         4) docs/migration-exceptions.md 한 줄 5) node scripts/competitor-profile-backfill.mjs --dry → --run 으로 첫 소급.

CREATE TABLE IF NOT EXISTS public.competitor_profile_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('ok', 'unverified', 'failed')),
  fail_reason     text,
  sections        jsonb,
  -- 무엇으로 만들었나: 어느 코드 버전 · 어느 모델 · 어느 경로(extract 직후 / 백필 / 수동)
  prompt_version  text NOT NULL,
  model           text,
  trigger         text NOT NULL CHECK (trigger IN ('extract', 'backfill', 'manual')),
  -- 무엇을 읽었나: 프롬프트에 실린 원문 수 / 그 시점 프로젝트 원문 전체 / 실린 원문의 created_at 창
  input_count     integer NOT NULL DEFAULT 0,
  input_total     integer NOT NULL DEFAULT 0,
  inputs_from     timestamptz,
  inputs_to       timestamptz,
  -- 검증 수치: 근거 없어 버린 주장 수 · 주장에 실제로 인용된 원문 수(0 과 "안 세었다"를 가른다 — failed 면 NULL)
  dropped_claims  integer,
  cited_inputs    integer,
  -- 시간·비용 — extract 스텝과 같은 단위(agent_run_steps.detail 과 대조용). cost_usd 는 claude-cli 봉투 명목값, 못 읽으면 NULL.
  duration_ms     integer,
  cost_usd        numeric,
  CONSTRAINT competitor_profile_snapshots_body_matches_status
    CHECK ((status = 'failed') = (sections IS NULL))
);

-- 화면·백필이 "이 프로젝트의 최신 스냅샷"을 읽는 경로.
CREATE INDEX IF NOT EXISTS idx_competitor_profile_snapshots_project_created
  ON public.competitor_profile_snapshots (project_id, created_at DESC);

ALTER TABLE public.competitor_profile_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_profile_snapshots FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.competitor_profile_snapshots IS
  '경쟁사 프로필 스냅샷(프로젝트 1건 = 재합성 1회 = 행 1개). sections 의 각 주장은 코드가 단 원문 근거(input_id·label·link)를 갖는다. failed 면 sections NULL. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.competitor_profile_snapshots.prompt_version IS
  'lib/analysis/competitor-profile.ts PROFILE_PROMPT_VERSION. 다르면 백필(scripts/competitor-profile-backfill.mjs)이 다시 만든다.';
COMMENT ON COLUMN public.competitor_profile_snapshots.sections IS
  '{section: [{claim, evidence:[{input_id,label,link}]}]}. evidence.input_id = analysis_inputs.id(FK 아님 — 폐기 뒤에도 기록 유지).';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='competitor_profile_snapshots';                                  -- 17
--   select relrowsecurity, relforcerowsecurity from pg_class where relname='competitor_profile_snapshots';       -- true / true
--   select count(*) from pg_policies where tablename='competitor_profile_snapshots';                             -- 0
--   select indexname from pg_indexes where tablename='competitor_profile_snapshots';                             -- pkey + idx_…_project_created
-- ── 음성 (롤백되는 형태) ──
--   begin; insert into public.competitor_profile_snapshots (project_id, status, prompt_version, trigger)
--     select id, 'ok', 'x', 'manual' from public.analysis_projects limit 1; rollback;                            -- 기대: ERROR 23514 (ok 인데 본문 없음)
--   begin; insert into public.competitor_profile_snapshots (project_id, status, sections, prompt_version, trigger)
--     select id, 'failed', '{}'::jsonb, 'x', 'manual' from public.analysis_projects limit 1; rollback;           -- 기대: ERROR 23514 (failed 인데 본문 있음)
--   begin; insert into public.competitor_profile_snapshots (project_id, status, sections, prompt_version, trigger)
--     select id, 'ok', '{}'::jsonb, 'x', 'cron' from public.analysis_projects limit 1; rollback;                 -- 기대: ERROR 23514 (trigger 어휘 밖)
