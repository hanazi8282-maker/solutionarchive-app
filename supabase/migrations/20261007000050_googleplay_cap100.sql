-- ============================================================
-- 20261007000050_googleplay_cap100
--
-- 구글 플레이 요청 상한 60→100, 램프 cap_base 60→100 · 50%(50건)에서 재시작(남헌 결정 2026-10-08 v40 §3-①).
-- 90%까지 단계 상승은 기존 퍼센트 램프 엔진(lib/review/ramp.ts)이 한다 — 이 마이그는 시작점만 바꾼다.
--
-- ⚠️ 약관/robots 위험(사실만): googleplay 는 robots Disallow `/_` 이고 약관 3.3조가 자동화를 금지한다.
--   소유자 예외(review_sources.override='owner_2026-10-06') 아래 enabled=true 로 켜진 소스다. 요청량을 늘리면 차단 위험이 커진다.
--   차단 신호가 나오면 lib/review/ramp.ts 가 이미 램프를 감속(직전 단계로 내리고 동결)한다 — 이 마이그가 새로 만드는 안전장치는 없다.
--   위험 감수 범위는 docs/migration-exceptions.md 2026-10-08 절에 기록.
--
-- 변경(정확히 3건):
--   (a) review_sources.googleplay daily_request_cap 60→100 (현재값 60 가드)
--   (b) review_source_ramp.googleplay: cap_base=100 · daily_request_target=50(=floor(100×50/100)) · pct_step=50 ·
--       consecutive_ok_days=0 · schedule_plan=NULL · reason · changed_at=now()  (cap_base=60 가드)
--       schedule_plan 을 비우는 이유: 옛 cap 기준 계획이 오늘 남은 슬롯에서 새 상한과 어긋나지 않게.
--       NULL 은 안전하다 — lib/review/ramp.ts validPlan(raw 가 falsy → null) → collectWithRamp 가 '예산: 스케줄 계획 없음 → 퍼센트 목표만(기존 2슬롯)'
--       경로로 간다(러너 예산 = min(daily_request_cap, daily_request_target) − 오늘 쓴 요청). 다음 stepPctRamps 판정이 새 계획을 쓴다.
--       (비우지 않으면: 현 계획 date=2026-10-07 · last_evaluated_date=2026-10-07 이라 validPlan 의 startDayCarry 예외로 10-08 에도 유효한 채 옛 값을 쓴다.)
--   (c) review_source_ramp_log 1행: event='start', prev/new_level = 현재 level, prev_pct 현재값 → new_pct 50, applied_by 'human-migration …' — 감사 흔적.
--       CLAUDE.md §10.1 '모든 변경은 ramp_log 에 행을 남긴다'는 무인 루프 권한의 조건이지만, 같은 이력 테이블에 사람 변경도 남겨 둔다.
--       event 는 CHECK 상 start/day/rise/block 뿐이고 block 만 집계(14일 에스컬레이션)에 쓰여 'start' 가 부작용이 없다.
--       로그를 먼저 쓴다(엔진 관례). log 는 source_key FK 없음·NOT NULL: source_key,new_level,reason,applied_by.
--
-- 건드리지 않는 칸: level(0) · last_evaluated_date · supply_state · blocks_at_step · block_line · frozen_until · targets_per_run.
--   last_evaluated_date 를 그대로 두면 다음 판정(10-09)에서 오늘(10-08)이 첫 정상일로 셀 수 있다(오늘 일부는 옛 값으로 돌았을 수 있음).
--
-- 🟡 비파괴(UPDATE 2행 + INSERT 1행, 삭제 없음). 상한을 올리는 변경이므로 사람 마이그(소유자 예외 소스는 야간 자동 상향 없음).
--    끝의 DO 블록이 값이 어긋나면 RAISE → 트랜잭션 롤백(현재값 가드로 0행이 된 경우도 여기서 잡힌다).
-- 선행: 20260930000034 · 20261006000002 · 20261007000030 · 20261007000040 적용.
-- 롤백: 20261007000050_googleplay_cap100_rollback.sql
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 CEO-STAFF(Opus 사전검토 뒤). 절차:
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 아래 '적용 전' 쿼리 3) 실행 → 하단 확인 쿼리 4) docs/migration-exceptions.md 적용 기록
-- ============================================================

-- ── 적용 전 확인(information_schema·직접 SELECT, PostgREST head:true 금지 — §7.1) ──
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_source_ramp'
--      AND column_name IN ('pct_step','cap_base','daily_request_target','schedule_plan');   -- 기대: 4
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_source_ramp_log'
--      AND column_name IN ('prev_pct','new_pct','event','applied_by');                       -- 기대: 4
--   -- 적용 전 스냅샷(2026-10-07 UTC 15:5x CEO-STAFF 실측: cap 60 · override owner_2026-10-06 · enabled true / 램프 level 0 · pct_step 50 · cap_base 60 · target 30 · ok_days 0)
--   SELECT key, enabled, daily_request_cap, override FROM public.review_sources WHERE key='googleplay';
--   SELECT level, pct_step, cap_base, daily_request_target, consecutive_ok_days, last_evaluated_date, supply_state,
--          blocks_at_step, block_line, frozen_until, schedule_plan, reason
--     FROM public.review_source_ramp WHERE source_key='googleplay';
--   (cap_base 가 60 이 아니면 멈춘다 — 가드에 안 걸려 로그·램프가 0행이 되고 DO 블록이 RAISE 한다.)

BEGIN;

UPDATE public.review_sources SET daily_request_cap = 100 WHERE key = 'googleplay' AND daily_request_cap = 60;

INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
SELECT 'googleplay', level, level, pct_step, 50, 'start',
       '남헌 v40 2026-10-08 — 구글 플레이 cap_base 60→100(램프 50%=50건에서 시작, 90%까지 단계 상승)', 'human-migration 20261007000050'
  FROM public.review_source_ramp WHERE source_key = 'googleplay' AND cap_base = 60;

UPDATE public.review_source_ramp
   SET cap_base = 100, daily_request_target = 50 /* =floor(100*50/100) */, pct_step = 50, consecutive_ok_days = 0, schedule_plan = NULL,
       reason = '남헌 v40 2026-10-08 — 구글 플레이 cap_base 60→100(램프 50%=50건에서 시작, 90%까지 단계 상승)', changed_at = now()
 WHERE source_key = 'googleplay' AND cap_base = 60;

DO $$
DECLARE c int; r public.review_source_ramp%ROWTYPE; l int;
BEGIN
  SELECT daily_request_cap INTO c FROM public.review_sources WHERE key = 'googleplay';
  IF c IS DISTINCT FROM 100 THEN RAISE EXCEPTION 'googleplay daily_request_cap=%(기대 100)', c; END IF;
  SELECT * INTO r FROM public.review_source_ramp WHERE source_key = 'googleplay';
  IF r.cap_base IS DISTINCT FROM 100 OR r.daily_request_target IS DISTINCT FROM 50 OR r.pct_step IS DISTINCT FROM 50 OR r.schedule_plan IS NOT NULL THEN
    RAISE EXCEPTION 'googleplay 램프 cap_base=% target=% pct_step=% plan_null=%(기대 100/50/50/true)', r.cap_base, r.daily_request_target, r.pct_step, (r.schedule_plan IS NULL);
  END IF;
  SELECT count(*) INTO l FROM public.review_source_ramp_log WHERE source_key = 'googleplay' AND applied_by = 'human-migration 20261007000050';
  IF l <> 1 THEN RAISE EXCEPTION '로그 행 % 개(기대 1)', l; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT daily_request_cap FROM public.review_sources WHERE key='googleplay';                       -- 기대: 100
-- SELECT cap_base, daily_request_target, pct_step, consecutive_ok_days, schedule_plan IS NULL AS plan_null, level, changed_at
--   FROM public.review_source_ramp WHERE source_key='googleplay';                                    -- 기대: 100 · 50 · 50 · 0 · true · 0 · 방금
-- SELECT event, prev_pct, new_pct, applied_by, created_at FROM public.review_source_ramp_log
--  WHERE source_key='googleplay' ORDER BY created_at DESC LIMIT 2;                                   -- 기대: 첫 행 start·50·50·human-migration 20261007000050
-- 음성(롤백되는 형태):
-- BEGIN; UPDATE public.review_source_ramp SET pct_step = 55 WHERE source_key='googleplay'; ROLLBACK;  -- 기대: 23514 review_source_ramp_pct_step_check
-- BEGIN; UPDATE public.review_source_ramp SET cap_base = 0 WHERE source_key='googleplay'; ROLLBACK;   -- 기대: 23514 review_source_ramp_cap_base_check
-- BEGIN; INSERT INTO public.review_source_ramp_log (source_key,new_level,reason,applied_by,event)
--        VALUES ('googleplay',0,'x','x','nope'); ROLLBACK;                                            -- 기대: 23514 review_source_ramp_log_event_check
-- BEGIN; UPDATE public.review_sources SET daily_request_cap = 100 WHERE key='googleplay' AND daily_request_cap = 60; ROLLBACK;
--   -- 기대: UPDATE 0 (이미 100 — 현재값 가드, 재실행해도 값 불변)
