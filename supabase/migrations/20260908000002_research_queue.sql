-- ============================================================
-- 20260908000002_research_queue
--
-- 매일 무엇을 조사할지 **미리 정해 두는 큐**. 1테이블.
--
-- ⚠️ 미적용. 사람이 적용한다:
--     supabase db query --linked -f supabase/migrations/20260908000002_research_queue.sql
--
-- 왜 큐가 필요한가 (에이전트에게 "알아서 골라"를 시키지 않는 이유)
--   조사 대상을 매 실행 LLM 이 즉석에서 고르면 두 가지가 무너진다.
--     (1) 같은 브랜드를 반복 조사한다. 어제 뭘 했는지 모르기 때문이다.
--     (2) **성공 사례로만 쏠린다.** 웹서치는 생존 편향이 심하고, 프롬프트로
--         "실패 사례도 봐라"라고 적어 두면 지켜지지 않는다. 그래서 실패 사례
--         할당량을 어휘(`failure_quota`)로 만들고 스크립트가 강제한다.
--         문서가 아니라 로직이 지키게 한다.
--
-- reason 어휘가 곧 "왜 이걸 조사했나"의 정본이다. 나중에 커버리지가 늘었을 때
-- 무엇이 기여했는지(갭 메우기 vs CEO 피드백 vs 실패 할당)를 되짚을 수 있다.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.research_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 조사 전이라 slug 가 확정이 아니다. 힌트로만 둔다. 실제 slug 는
  -- case_studies 가 만든다 (거기 UNIQUE 가 중복의 최종 방어선이다).
  slug_hint         text,

  brand_name        text NOT NULL,
  market            text,

  -- 이 조사로 메우려는 병목. case_studies.bottleneck 과 **같은 7종**이다.
  -- 어휘가 갈라지면 커버리지 계산이 조용히 틀린다.
  target_bottleneck text CHECK (target_bottleneck IN (
                      'AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION',
                      'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY')),

  -- ★ failure_quota = 실패·피벗·철수 사례 할당분.
  --   생존 편향을 어휘 수준에서 못박는다. scripts/research-queue.mjs 가
  --   --plan N 마다 최소 1건을 이 이유로 넣지 못하면 exit≠0 로 죽는다.
  reason            text NOT NULL CHECK (reason IN (
                      'coverage_gap',      -- 병목 커버리지가 2케이스 미만
                      'ceo_feedback',      -- reports/feedback/*.md 에서 요청
                      'pattern_candidate', -- 반복 패턴 후보 보강
                      'failure_quota',     -- 실패/피벗/철수 사례 할당분
                      'manual')),          -- 사람이 직접 넣음

  -- 낮을수록 먼저. 기본 100.
  priority          int NOT NULL DEFAULT 100,

  -- queued  = 대기
  -- claimed = 이번 실행이 집었다 (중복 조사 방지)
  -- done    = 초안이 나왔다
  -- skipped = 이번엔 안 했다 (사유는 notes)
  -- failed  = 조사했는데 쓸 만한 근거를 못 찾았다 ★ done 과 섞지 않는다
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'claimed', 'done', 'skipped', 'failed')),

  requested_by      text,

  -- 어느 실행이 집었나. agent_runs 를 지워도 큐는 남아야 하므로 SET NULL.
  run_id            uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,

  CONSTRAINT research_queue_resolve_order
    CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

COMMENT ON TABLE public.research_queue IS
  '조사 대기열. 무엇을 왜 조사하는지의 정본. 생존 편향 방지는 reason=failure_quota 로 강제한다.';
COMMENT ON COLUMN public.research_queue.reason IS
  'failure_quota 는 실패·피벗·철수 사례 할당분. research-queue.mjs 가 --plan 마다 1건 이상을 강제한다.';
COMMENT ON COLUMN public.research_queue.status IS
  'failed 와 done 을 섞지 않는다 — "조사했는데 근거 없음"과 "적립 완료"는 다른 사건이다.';
COMMENT ON COLUMN public.research_queue.target_bottleneck IS
  'case_studies.bottleneck 과 같은 7종 어휘. 갈라지면 커버리지 계산이 틀린다.';

CREATE INDEX IF NOT EXISTS research_queue_pick_idx
  ON public.research_queue (status, priority, created_at);
CREATE INDEX IF NOT EXISTS research_queue_run_idx
  ON public.research_queue (run_id);

COMMIT;


-- ============================================================
-- 검증 쿼리 (적용 직후)
-- ============================================================
--
-- ── 양성 1) 테이블이 생겼는가
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='research_queue';   -- 기대: 1행
--
-- ── 양성 2) 정상 INSERT + 기본값
-- INSERT INTO public.research_queue (brand_name, reason) VALUES ('__probe__','failure_quota');
-- SELECT brand_name, status, priority FROM public.research_queue WHERE brand_name='__probe__';
--   기대: __probe__ | queued | 100
--
-- ── 음성 1) 어휘 밖 reason 은 거절돼야 한다
-- INSERT INTO public.research_queue (brand_name, reason) VALUES ('__probe2__','왠지끌려서');
--   기대: ERROR 23514 research_queue_reason_check
--
-- ── 음성 2) 어휘 밖 bottleneck 은 거절돼야 한다 (case_studies 와 같은 7종)
-- INSERT INTO public.research_queue (brand_name, reason, target_bottleneck)
--   VALUES ('__probe3__','manual','VIBES');
--   기대: ERROR 23514 research_queue_target_bottleneck_check
--
-- ── 음성 3) brand_name NULL 은 거절돼야 한다
-- INSERT INTO public.research_queue (reason) VALUES ('manual');
--   기대: ERROR 23502 not_null_violation
--
-- ── 정리
-- DELETE FROM public.research_queue WHERE brand_name LIKE '\_\_probe%';


-- ============================================================
-- 거부한 대안
-- ============================================================
--
-- (A) 큐 없이 매 실행 LLM 이 대상을 고르기
--     같은 브랜드 반복 + 성공 사례 편향. 둘 다 프롬프트로는 못 막는다.
--
-- (B) failure_quota 를 boolean 컬럼(`is_failure_case`)으로
--     그러면 "왜 넣었나"(reason)와 "실패 사례인가"가 두 컬럼이 되고, 둘이
--     어긋난 행이 생긴다. 조사 이유가 곧 실패 할당분인 것이므로 어휘 하나로 둔다.
--
-- (C) slug 를 NOT NULL UNIQUE 로
--     조사 전에는 slug 를 확정할 수 없다. 힌트로 두고 중복 방어는
--     case_studies.slug UNIQUE 가 맡는다.
--
-- (D) run_id 를 NOT NULL 로
--     사람이 손으로 넣는 행(reason='manual')은 실행에 속하지 않는다.
