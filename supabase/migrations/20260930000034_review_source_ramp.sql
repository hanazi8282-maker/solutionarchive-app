-- ============================================================
-- 20260930000034_review_source_ramp
--
-- 수집 속도 점진 인상(램프)의 **단계 값 자리** + 변경 이력. 신규 테이블 2개.
--
-- 근거: reports/2026-09-28/cowork-four-orders.md §2-2 "필요한 것 2", 남헌 2026-09-28 확정.
--   올리는 것은 소스별 1회 타깃 수 — 계단 10 → 15 → 22 → 30(lib/review/ramp.ts RAMP_STEPS, level 0~3).
--   `review_sources` 는 무인 루프 쓰기 금지(§10.1, daily_request_cap 한 컬럼만 예외)라 별도 테이블이다.
--
-- ⚠️ 이 마이그는 **자리만** 만든다. 초기 행 없음, 러너는 아직 이 값을 읽지 않는다(엔진 착수 때 배선).
--    무인 루프가 이 테이블에 쓰는 권한은 §10.1 에 아직 없다 — 엔진 착수 전에 §10.1 한 줄이 먼저다.
--
-- 설계에서 갈린 것:
--   · review_source_ramp.source_key 는 FK(review_sources) ON DELETE CASCADE — 현재값은 소스와 함께 산다.
--   · review_source_ramp_log.source_key 는 **FK 없음** — 감사 로그는 대상이 지워져도 남는다
--     (review_source_cap_log 20260930000011 과 같은 이유).
--   · targets_per_run 을 level 과 따로 저장한다 — 계단 상수가 나중에 바뀌어도 "그때 몇 개로 돌았나"가 남는다.
--   · frozen_until: 되돌리기(직전 단계 + 14일 동결) 때 채운다. NULL = 동결 없음.
--   · prev_level NULL = 첫 행(이전 값 없음).
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례).
--
-- 🟢 비파괴. CREATE TABLE IF NOT EXISTS 2개 + 인덱스 1개. 기존 테이블·행 무변경, 백필 없음. 롤백 파일 있음.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 절차:
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) information_schema 로 부재 확인
--   3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_source_ramp (
  source_key      text        PRIMARY KEY
                              REFERENCES public.review_sources(key) ON DELETE CASCADE,
  level           smallint    NOT NULL DEFAULT 0,
  targets_per_run integer     NOT NULL,
  frozen_until    timestamptz,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  reason          text        NOT NULL,

  CONSTRAINT review_source_ramp_level_check   CHECK (level BETWEEN 0 AND 3),
  CONSTRAINT review_source_ramp_targets_check CHECK (targets_per_run > 0),
  CONSTRAINT review_source_ramp_reason_check  CHECK (length(btrim(reason)) > 0)
);

CREATE TABLE IF NOT EXISTS public.review_source_ramp_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key  text        NOT NULL,
  prev_level  smallint,
  new_level   smallint    NOT NULL,
  reason      text        NOT NULL,
  applied_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT review_source_ramp_log_level_check
    CHECK (new_level BETWEEN 0 AND 3 AND (prev_level IS NULL OR prev_level BETWEEN 0 AND 3))
);

CREATE INDEX IF NOT EXISTS review_source_ramp_log_source_idx
  ON public.review_source_ramp_log (source_key, created_at DESC);

ALTER TABLE public.review_source_ramp     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_source_ramp     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.review_source_ramp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_source_ramp_log FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_source_ramp IS
  '소스별 수집 램프 현재 단계(1회 타깃 수 계단 10/15/22/30 = level 0~3). 행 없음 = 램프 미적용(기본 타깃 수). 정책 0개 = service_role 전용.';
COMMENT ON TABLE public.review_source_ramp_log IS
  'review_source_ramp 변경 이력(감사). source_key FK 없음 — 소스가 지워져도 남는다.';

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT table_name, count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name IN ('review_source_ramp','review_source_ramp_log')
--  GROUP BY 1;                                               -- 기대: ramp 6 · ramp_log 7
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--  WHERE relname IN ('review_source_ramp','review_source_ramp_log');   -- 기대: t, t 두 행
-- SELECT count(*) FROM pg_policies
--  WHERE tablename IN ('review_source_ramp','review_source_ramp_log');  -- 기대: 0
-- SELECT count(*) FROM public.review_source_ramp;           -- 기대: 0 (초기 행 없음)
-- 음성(롤백되는 형태):
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason)
--        VALUES ('clien', 4, 40, 'x'); ROLLBACK;            -- 기대: 23514
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason)
--        VALUES ('no-such-source', 10, 'x'); ROLLBACK;      -- 기대: 23503
