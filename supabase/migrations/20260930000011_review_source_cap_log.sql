-- ============================================================
-- 20260930000011_review_source_cap_log
--
-- `review_sources.daily_request_cap` 자동 반영의 **감사 로그** 한 자리.
-- 신규 테이블 `review_source_cap_log` 하나뿐이다.
--
-- 왜 필요한가: CLAUDE.md §10.1 은 무인 루프가 `review_sources` 를 UPDATE 하지 않는다고
-- 못 박아 두었다. 남헌 2026-09-24 지시로 `daily_request_cap` **한 컬럼**에 예외를 뒀고,
-- 그 예외의 조건이 셋이다 — 컬럼 1개 · 상한 2배 이내 · **감사 로그 필수**.
-- 이 테이블이 그 세 번째다. 그래서 스크립트는 이 테이블이 없으면
-- "로그 테이블 미적용이라 반영 안 함" 으로 멈춘다(`scripts/review-request-cap.mjs`).
-- 로그 없는 변경을 한 건도 만들지 않는 것이 이 설계의 요점이다.
--
-- 🟢 비파괴. CREATE TABLE IF NOT EXISTS 1개 + 인덱스 1개. 기존 행·컬럼·제약을
--    건드리지 않고 백필도 없다. 롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음:
--      삭제 없음 · 기존 데이터 손상 없음(UPDATE·백필 없음) · 인증 경계 안 건드림
--      (RLS ON + FORCE, 정책 0개 = service_role 전용) · 새 수집 소스 아님 ·
--      사업 방향 결정 아님.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가
--    아니다). 사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 이미 있는지 확인 — PostgREST head:true 는 없는 테이블에도
--         204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- 미적용 상태에서 밤 수집은 죽지 않는다: pre-step 이 판정 표만 찍고 UPDATE 를 건너뛴다
-- ("반영 안 함" 을 명시적으로 출력한다 — 조용히 성공으로 접지 않는다, §7.1).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- review_source_cap_log — 상한을 언제·왜·얼마에서 얼마로 바꿨나
--
-- 설계에서 갈린 것들:
--   · `source_key` 에 **FK 를 걸지 않는다.** 소스 행이 나중에 지워져도 "그때 이런
--     변경을 했다"는 기록은 남아야 한다. 감사 로그가 대상과 함께 사라지면 감사가 아니다.
--   · `previous_cap` 과 `new_cap` 을 **둘 다** 적는다. 차이를 계산으로 복원하려면
--     같은 소스의 이전 행을 믿어야 하는데, 사람이 대시보드에서 손으로 바꾼 변경은
--     이 표에 안 남는다(스크립트만 쓴다). 그래서 매 행이 스스로 완결되어야 한다.
--   · `need` · `recommended` 를 같이 남긴다 — 나중에 "이 값이 왜 이렇게 컸나"를
--     타깃 수 변화와 대조할 수 있어야 한다(§7.2: 수치를 함께 남겨라).
--   · `new_cap` 이 NULL 인 행도 허용한다 = **반영하지 않은 판정**(hold, 또는 UPDATE
--     실패). 로그에 성공만 남으면 "왜 안 올랐나"를 알 자리가 없다.
--   · `applied_by` 는 실행 주체 문자열이다(`workflow:Nightly Review Collect` ·
--     `local`). 사람이 돌린 것과 밤 루프가 한 것을 구분하려고 둔다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260930000002 와 같다).
--   브라우저 anon 키로 운영 이력을 읽는 경로를 막는다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_source_cap_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key   text        NOT NULL,
  previous_cap integer     NOT NULL,
  new_cap      integer,
  need         integer     NOT NULL,
  recommended  integer     NOT NULL,
  reason       text        NOT NULL,
  applied_by   text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- 음수 상한은 어떤 경로로도 나올 수 없다. 나오면 계산이 깨진 것이다.
  CONSTRAINT review_source_cap_log_caps_check
    CHECK (previous_cap >= 0 AND (new_cap IS NULL OR new_cap >= 0)),
  CONSTRAINT review_source_cap_log_need_check
    CHECK (need >= 0 AND recommended >= 0)
);

-- 조회는 항상 "이 소스의 최근 변경"이다.
CREATE INDEX IF NOT EXISTS review_source_cap_log_source_idx
  ON public.review_source_cap_log (source_key, created_at DESC);

ALTER TABLE public.review_source_cap_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_source_cap_log FORCE ROW LEVEL SECURITY;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
--
-- 양성: 테이블이 생겼고 컬럼 9개다.
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_source_cap_log'
--  ORDER BY ordinal_position;     -- 기대: 9행(id, source_key, previous_cap, new_cap,
--                                 --        need, recommended, reason, applied_by, created_at)
--
-- 양성: RLS 가 켜져 있고 정책은 0개다(service_role 전용).
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--  WHERE oid = 'public.review_source_cap_log'::regclass;      -- 기대: t, t
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public' AND tablename='review_source_cap_log';   -- 기대: 0
--
-- 음성: review_sources 는 이 마이그레이션이 손대지 않았다.
-- SELECT key, enabled, min_interval_ms, daily_request_cap FROM public.review_sources
--  ORDER BY key;                  -- 기대: 적용 전과 완전히 동일
--
-- 음성(롤백되는 형태로 — 데이터를 남기지 않는다): CHECK 가 음수를 막는다.
-- BEGIN;
--   INSERT INTO public.review_source_cap_log
--          (source_key, previous_cap, new_cap, need, recommended, reason, applied_by)
--   VALUES ('danawa', -1, 10, 10, 13, 'negative test', 'manual');   -- 기대: 23514 로 실패
-- ROLLBACK;
--
-- 첫 pre-step 실행 뒤(§7.1 — 조용한 0건과 미배선을 가른다):
-- SELECT source_key, previous_cap, new_cap, need, recommended, applied_by, created_at
--   FROM public.review_source_cap_log ORDER BY created_at DESC LIMIT 20;
--   -- ⚠️ 0행이면 두 가지다: (a) 올릴 소스가 없었다(전부 keep — 정상) 또는
--   --    (b) pre-step 이 안 돌았다. 가르는 법은 Actions 로그의 판정 표다 —
--   --    표가 찍혔는데 0행이면 (a), 표 자체가 없으면 (b).
