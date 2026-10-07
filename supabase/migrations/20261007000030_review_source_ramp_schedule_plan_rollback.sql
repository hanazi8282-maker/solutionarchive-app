-- 롤백: 20261007000030_review_source_ramp_schedule_plan
-- 새 칸만 지운다. 값은 매일 다시 계산되는 파생값이라 잃는 데이터가 없다. 코드는 칸이 없어도 돈다(기존 2슬롯·기존 예산).
-- 순서: 코드를 먼저 되돌리든 아니든 무방 — 코드가 42703 을 계획 없음으로 접는다.

BEGIN;

ALTER TABLE public.review_source_ramp DROP COLUMN IF EXISTS schedule_plan;

COMMIT;

-- 확인: SELECT count(*) FROM information_schema.columns
--        WHERE table_schema='public' AND table_name='review_source_ramp' AND column_name='schedule_plan';  -- 기대: 0
