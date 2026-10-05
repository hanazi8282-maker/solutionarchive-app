-- ============================================================
-- 20261006000002_review_source_ramp_pct
--
-- 퍼센트 램프(소스별 하루 요청 수 = 상한의 50→60→70→80→90%)의 **상태 칸**. 기존 두 테이블에 ADD COLUMN 만.
--
-- 근거: 남헌 v24 #2 + v25 (2026-10-06) 확정 규칙, 설계 reports/2026-10-06/percent-ramp-table.md §6(권고안 B·B·A).
--   엔진 lib/review/ramp.ts(PCT_STEPS · judgePctDay · nextPctState · pctOnBlock · allocateShares · stepPctRamps).
--   타깃 수 계단(level / targets_per_run, 000034)과 **다른 손잡이**라 칸을 나눈다 — 기존 칸은 그대로.
--
-- ⚠️ 이 마이그는 **자리만** 만든다. 소스별 값(cap_base = 상한)은 넣지 않는다 — 남헌이 단계표를 본 뒤 별도 승인으로 넣는다.
--    cap_base IS NULL 인 행 = 퍼센트 램프 미가동(러너 예산은 지금처럼 daily_request_cap 만). 행이 없어도 마찬가지.
--
-- 칸:
--   pct_step              현재 단계(50/60/70/80/90). 시작 50. 90 초과 금지(CHECK).
--   cap_base              단계 계산의 분모(그 소스 하루 실제 상한) **스냅샷**. 야간 cap 자동 상향(review-request-cap)을 따라가지 않는다.
--                         갱신 = 사람·역할 세션, 또는 차단선 재정의(floor(block_line × 0.9), 내리는 쪽만 — 엔진).
--   daily_request_target  오늘 목표 = floor(min(cap_base, 배분 몫) × pct_step / 100). 러너 예산 = min(daily_request_cap, 이 값) − 오늘 쓴 요청.
--   consecutive_ok_days   연속 정상 일수(UTC 날). 2 가 되면 한 단계 올리고 0. 차단이면 0. 공급 부족·오류·쿼터·동결·측정 없음은 그대로(보류).
--   last_evaluated_date   마지막으로 판정한 UTC 날 — 같은 날을 두 번 세지 않는 잠금.
--   block_line / _at      차단이 난 날 그 소스의 그날 요청 합(차단선)과 시각.
--   blocks_at_step        직전 차단이 난 단계의 누적 차단 횟수(로그 event='block' ∧ prev_pct 집계). 2 이상이면 동결 14일.
--   supply_state          어제 공급 판정 met(충족) / short(직전 단계 목표 미만) / none(측정 없음) — 요약 줄용.
--   is_stable             pct_step = 90 생성 컬럼 — 내부 현황판의 '안정 소스' 표시. 쓰지 않는다(엔진도 안 쓴다).
--   로그 prev_pct / new_pct / event — 두 손잡이의 이력을 섞지 않으려고 따로 둔다. event NULL = 이 마이그 전 행(타깃 수 계단).
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 13개(현재 10 + 로그 3). NOT NULL 칸은 전부 상수 DEFAULT 라 메타데이터 변경
--    (테이블 재작성 없음 — is_stable 생성 컬럼만 재작성이지만 000034 이후 행 0~수 건). 기존 행·값 무변경, 백필 없음. 롤백 파일 있음.
--    CLAUDE.md §10.2 사람 판단 예외 1~8 해당 없음(삭제·데이터 손상·키·법적·사업·지시 충돌·돈·사람 입력 없음).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 절차:
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) information_schema 로 000034 테이블 있음·이 칸들 없음 확인
--   3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 한 줄
--   미적용이어도 코드는 깨지지 않는다 — loadSourceRamp 가 42703/PGRST204 면 옛 칸만 다시 읽고(타깃 수 계단만, 지금과 같음),
--   stepPctRamps 는 ⚠️ 한 줄 남기고 판정을 건너뛴다.
-- ============================================================

BEGIN;

ALTER TABLE public.review_source_ramp
  ADD COLUMN IF NOT EXISTS pct_step             smallint    NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cap_base             integer,
  ADD COLUMN IF NOT EXISTS daily_request_target integer,
  ADD COLUMN IF NOT EXISTS consecutive_ok_days  smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_evaluated_date  date,
  ADD COLUMN IF NOT EXISTS block_line           integer,
  ADD COLUMN IF NOT EXISTS block_line_at        timestamptz,
  ADD COLUMN IF NOT EXISTS blocks_at_step       smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supply_state         text,
  ADD COLUMN IF NOT EXISTS is_stable            boolean     GENERATED ALWAYS AS (pct_step = 90) STORED;

ALTER TABLE public.review_source_ramp
  ADD CONSTRAINT review_source_ramp_pct_step_check    CHECK (pct_step IN (50, 60, 70, 80, 90)),
  ADD CONSTRAINT review_source_ramp_cap_base_check    CHECK (cap_base IS NULL OR cap_base > 0),
  ADD CONSTRAINT review_source_ramp_target_check      CHECK (daily_request_target IS NULL OR daily_request_target >= 0),
  ADD CONSTRAINT review_source_ramp_ok_days_check     CHECK (consecutive_ok_days >= 0),
  ADD CONSTRAINT review_source_ramp_block_line_check  CHECK (block_line IS NULL OR block_line >= 0),
  ADD CONSTRAINT review_source_ramp_blocks_check      CHECK (blocks_at_step >= 0),
  ADD CONSTRAINT review_source_ramp_supply_check      CHECK (supply_state IS NULL OR supply_state IN ('met', 'short', 'none'));

ALTER TABLE public.review_source_ramp_log
  ADD COLUMN IF NOT EXISTS prev_pct smallint,
  ADD COLUMN IF NOT EXISTS new_pct  smallint,
  ADD COLUMN IF NOT EXISTS event    text;

ALTER TABLE public.review_source_ramp_log
  ADD CONSTRAINT review_source_ramp_log_pct_check
    CHECK ((prev_pct IS NULL OR prev_pct IN (50, 60, 70, 80, 90)) AND (new_pct IS NULL OR new_pct IN (50, 60, 70, 80, 90))),
  ADD CONSTRAINT review_source_ramp_log_event_check
    CHECK (event IS NULL OR event IN ('start', 'day', 'rise', 'block'));

-- 14일 에스컬레이션 판정이 (source_key, event='block', prev_pct) 를 센다.
CREATE INDEX IF NOT EXISTS review_source_ramp_log_block_idx
  ON public.review_source_ramp_log (source_key, prev_pct) WHERE event = 'block';

COMMENT ON COLUMN public.review_source_ramp.cap_base IS
  '퍼센트 램프 분모(하루 상한) 스냅샷. NULL = 퍼센트 램프 미가동. 값은 남헌 승인으로만 넣는다(엔진은 차단선 재정의로 내리기만).';
COMMENT ON COLUMN public.review_source_ramp.daily_request_target IS
  '오늘 목표 요청 수. 러너 예산 = min(review_sources.daily_request_cap, 이 값) − 오늘 쓴 요청(lib/review/runner.ts).';
COMMENT ON COLUMN public.review_source_ramp.is_stable IS '안정 소스(pct_step = 90). 내부 현황판 표시용.';

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT table_name, count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name IN ('review_source_ramp','review_source_ramp_log')
--  GROUP BY 1;                                               -- 기대: ramp 16 · ramp_log 10
-- SELECT count(*) FROM public.review_source_ramp WHERE cap_base IS NOT NULL;   -- 기대: 0 (값은 별도 승인)
-- SELECT conname FROM pg_constraint WHERE conname LIKE 'review_source_ramp%pct%' OR conname LIKE 'review_source_ramp_log_event%';
--                                                             -- 기대: 3행
-- SELECT relforcerowsecurity FROM pg_class WHERE relname IN ('review_source_ramp','review_source_ramp_log');  -- 기대: t, t (그대로)
-- 음성(롤백되는 형태):
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, pct_step)
--        VALUES ('clien', 10, 'x', 100); ROLLBACK;          -- 기대: 23514 (90 초과 금지)
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, cap_base)
--        VALUES ('clien', 10, 'x', 0); ROLLBACK;            -- 기대: 23514
-- BEGIN; INSERT INTO public.review_source_ramp_log (source_key, new_level, reason, applied_by, event)
--        VALUES ('clien', 0, 'x', 'x', 'jump'); ROLLBACK;  -- 기대: 23514
-- BEGIN; INSERT INTO public.review_source_ramp (source_key, targets_per_run, reason, is_stable)
--        VALUES ('clien', 10, 'x', true); ROLLBACK;         -- 기대: 428C9 (생성 컬럼에 쓰기 거부)
