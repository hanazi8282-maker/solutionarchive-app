-- ============================================================
-- 20261014000070_googleplay_cap_base_30
--
-- googleplay cap_base 15 → 30 (남헌 v71i 결정 2 A, 2026-10-14). 램프 규칙 자체는 안 바꾼다 — 값 1개만.
-- 되돌리기: 20261014000070_googleplay_cap_base_30_rollback.sql (30 → 15).
-- 🟢 비파괴(1행 UPDATE + 로그 1행). 삭제 없음. cap_base_origin(60) 은 그대로라 원래 값 아래(30 ≤ 60).
-- daily_request_target 은 다음 램프 판정이 새 cap_base 로 다시 세운다(schedule_plan 은 건드리지 않음).
--
-- 적용 전 미리보기(읽기 전용): SELECT source_key, cap_base, cap_base_origin, daily_request_target FROM public.review_source_ramp WHERE source_key='googleplay';
--   기대: cap_base=15, cap_base_origin=60.
-- ============================================================

BEGIN;

INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
SELECT r.source_key, r.level, r.level, r.pct_step, r.pct_step, 'day',
       format('상한 %s→30(마이그 20261014000070 — 남헌 v71i 결정 2 A)', r.cap_base),
       'human-migration 20261014000070'
  FROM public.review_source_ramp r
 WHERE r.source_key = 'googleplay' AND r.cap_base = 15;

UPDATE public.review_source_ramp SET cap_base = 30, changed_at = now() WHERE source_key = 'googleplay' AND cap_base = 15;

COMMIT;
