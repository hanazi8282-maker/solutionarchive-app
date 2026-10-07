-- ============================================================
-- 20261007000030_review_source_ramp_schedule_plan
--
-- 수집 스케줄러(남헌 v30 §2)의 계획 칸 하나. review_source_ramp 에 ADD COLUMN 만.
--
-- 엔진 lib/review/ramp.ts(planSchedule · slotAllowance · plannedSourcesForSlot · stepPctRamps).
--   하루 1번(그날 첫 슬롯) stepPctRamps 가 cap_base 있는 행에만 쓴다:
--   { date, budget(B), runsPerDay(R ≤ 6), perRun(ceil(B/R)), perRunCap(min(시간 몫, P_safe)),
--     targetsPerRun(자동 산정, null=계단 그대로), bottleneck('targets'|'time'|'safe'|null), terms{...} }
--   bottleneck = 'targets' 가 "R=6 으로도 B 미충족 — 타깃 부족" 신호다. 공급 자동화(v30 §3)는
--   `schedule_plan->>'bottleneck' = 'targets'` 로 읽는다. supply_state(어제 실측 met/short/none)는 의미 그대로 둔다.
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 1개(nullable, DEFAULT 없음 → 메타데이터 변경, 테이블 재작성 없음). 기존 행·값 무변경, 백필 없음.
--    선행: 20260930000034(테이블) · 20261006000002(퍼센트 칸). 둘 다 적용돼 있어야 한다.
--    CLAUDE.md §10.2 사람 판단 예외 1~8 해당 없음. 롤백 파일 있음(새 칸 DROP — 값은 매일 다시 계산되는 파생값이라 잃는 것 없음).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 미적용이어도 코드는 깨지지 않는다:
--   loadSourceRamp 는 42703(schedule_plan) 이면 퍼센트 칸까지만 다시 읽고, stepPctRamps 는 이 칸만 빼고 갱신 + ⚠️ 한 줄,
--   추가 4슬롯은 plannedSourcesForSlot 이 확인 불가로 접어 아무 소스도 돌리지 않는다(기존 2슬롯 그대로).
-- ============================================================

BEGIN;

ALTER TABLE public.review_source_ramp
  ADD COLUMN IF NOT EXISTS schedule_plan jsonb;

COMMENT ON COLUMN public.review_source_ramp.schedule_plan IS
  '수집 스케줄 계획(v30 §2, lib/review/ramp.ts planSchedule). 엔진이 하루 1번 씀. NULL = 계획 없음(기존 2슬롯·기존 예산). bottleneck=targets = 타깃 부족 신호.';

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_source_ramp' AND column_name='schedule_plan';   -- 기대: jsonb
-- SELECT count(*) FROM public.review_source_ramp WHERE schedule_plan IS NOT NULL;                     -- 기대: 0 (엔진이 cap_base 행에만 씀)
-- 음성(롤백되는 형태 — 칸이 정말 jsonb 인지):
-- BEGIN; UPDATE public.review_source_ramp SET schedule_plan = 'x' WHERE false; ROLLBACK;  -- 기대: 22P02 (invalid input syntax for type json)
