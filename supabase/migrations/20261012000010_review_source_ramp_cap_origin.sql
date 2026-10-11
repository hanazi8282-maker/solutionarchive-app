-- ============================================================
-- 20261012000010_review_source_ramp_cap_origin
--
-- 퍼센트 램프 차단 반응 완화(남헌 v50 §2-1, 2026-10-12) — 원래 cap_base 를 기억하는 칸 1개 + 백필 + 하한 아래로 떨어진 행 끌어올리기.
--
-- 왜: 옛 규칙 cap_base := floor(차단선 × 0.9) 는 차단선이 "그날 그 시점까지 보낸 요청 수"라, googleplay 가 2026-10-09
--   요청 2건 만에 차단 1건을 받자 상한 60→1, 목표 0 이 됐다(ramp.reason "차단선 2, 상한 60→1"). 새 규칙(lib/review/ramp.ts):
--   차단 1건 = 절반(같은 UTC 날 1회), 하한 = 원래 값의 25%. 차단 없이 연속 정상 3일마다 ×2 로 원래 값까지 복구.
--   "원래 값" 을 둘 기존 칸이 없다 — daily_request_cap 은 야간 자동 상향(review-request-cap)이 올려서 원래 값이 아니다.
--
-- 내용:
--   (1) review_source_ramp.cap_base_origin integer NULL, CHECK (> 0). 엔진은 차단 때 max(origin ?? cap_base, cap_base) 로 쓴다.
--   (2) 백필: cap_base 있는 행 = GREATEST(cap_base, 그 소스 block 로그 사유의 "상한 A→" 중 최대 A).
--       googleplay 기대값 60(10-09 사유 "상한 60→1"). 차단 이력 없는 행은 = 현재 cap_base.
--   (3) 하한 끌어올리기: cap_base < floor(origin × 0.25) 인 행(googleplay 1 < 15)을 하한으로. 로그 1행을 먼저 남긴다
--       (사유에 "상한 복구" 표지 — 엔진의 다음 자동 복구가 3일 뒤부터 센다). daily_request_target = floor(하한 × pct/100),
--       schedule_plan = NULL(다음 판정이 새로 세운다).
--
-- 🟢 비파괴(ADD COLUMN · 소수 행 UPDATE). 삭제 없음. 롤백 파일 있음(_rollback).
--    §10.2 예외: 1 삭제 없음 · 2 손상 위험 — (3)은 소수 행 상향이고 로그·롤백이 있다 · 3~5 해당 없음 ·
--    6 지시 충돌 없음(남헌 v50 지시 그대로) · 7 돈 없음 · 8 사람 입력 불필요.
--    차단 이력 소스(todayhumor)·danawa 는 (3)에서 제외(§10.1 램프 대상 아님).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용 전:
--   1) 대상 solutionarchive `qmgrfqjfxqhxuufrnkwf` 2) information_schema 로 cap_base_origin 없음 확인
--   3) 아래 "적용 전 미리보기" 를 돌려 googleplay origin=60·lift_to=15 등 값을 눈으로 본다 4) 실행 → 하단 확인 5) docs/migration-exceptions.md
--   미적용이어도 코드는 돈다 — 칸이 없으면 엔진은 차단 시점 cap_base 를 원래 값으로 보고 절반만 하고(1 로는 안 떨어짐), 자동 복구는 안 한다(⚠️).
--
-- 적용 전 미리보기(읽기 전용):
-- SELECT r.source_key, r.cap_base, r.pct_step,
--        GREATEST(r.cap_base, COALESCE((SELECT max((substring(l.reason FROM '상한 ([0-9]+)→'))::int)
--                                         FROM public.review_source_ramp_log l
--                                        WHERE l.source_key = r.source_key AND l.event = 'block'), 0)) AS origin
--   FROM public.review_source_ramp r WHERE r.cap_base IS NOT NULL ORDER BY 1;
-- ============================================================

BEGIN;

ALTER TABLE public.review_source_ramp
  ADD COLUMN IF NOT EXISTS cap_base_origin integer;

ALTER TABLE public.review_source_ramp
  ADD CONSTRAINT review_source_ramp_cap_origin_check CHECK (cap_base_origin IS NULL OR cap_base_origin > 0);

COMMENT ON COLUMN public.review_source_ramp.cap_base_origin IS
  '원래 cap_base(남헌 v50). 차단 절반의 하한(25%)·자동 복구 상한의 기준. 엔진은 차단 때 max(이 값, 현재 cap_base) 로 쓴다.';

-- (2) 백필
UPDATE public.review_source_ramp r
   SET cap_base_origin = GREATEST(r.cap_base, COALESCE((
         SELECT max((substring(l.reason FROM '상한 ([0-9]+)→'))::int)
           FROM public.review_source_ramp_log l
          WHERE l.source_key = r.source_key AND l.event = 'block'), 0))
 WHERE r.cap_base IS NOT NULL AND r.cap_base_origin IS NULL;

-- (3) 하한 끌어올리기 — 로그 먼저(§10.1 "로그 없이 바꾸지 않는다"), 같은 조건으로 갱신.
INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
SELECT r.source_key, r.level, r.level, r.pct_step, r.pct_step, 'day',
       format('상한 복구 %s→%s(마이그 20261012000010 — v50 하한 = 원래 %s의 25%%)', r.cap_base, GREATEST(1, r.cap_base_origin / 4), r.cap_base_origin),
       'human-migration 20261012000010'
  FROM public.review_source_ramp r
 WHERE r.cap_base IS NOT NULL AND r.cap_base_origin IS NOT NULL
   AND r.cap_base < GREATEST(1, r.cap_base_origin / 4)
   AND r.source_key NOT IN ('todayhumor', 'danawa');

UPDATE public.review_source_ramp r
   SET cap_base = GREATEST(1, r.cap_base_origin / 4),
       daily_request_target = (GREATEST(1, r.cap_base_origin / 4) * r.pct_step) / 100,
       schedule_plan = NULL,
       reason = format('v50 하한 끌어올리기 %s→%s(원래 %s의 25%%) — 마이그 20261012000010', r.cap_base, GREATEST(1, r.cap_base_origin / 4), r.cap_base_origin),
       changed_at = now()
 WHERE r.cap_base IS NOT NULL AND r.cap_base_origin IS NOT NULL
   AND r.cap_base < GREATEST(1, r.cap_base_origin / 4)
   AND r.source_key NOT IN ('todayhumor', 'danawa');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_source_ramp WHERE cap_base IS NOT NULL AND cap_base_origin IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'cap_base 있는데 origin NULL % 행', n; END IF;
  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE cap_base IS NOT NULL AND cap_base < GREATEST(1, cap_base_origin / 4) AND source_key NOT IN ('todayhumor', 'danawa');
  IF n <> 0 THEN RAISE EXCEPTION '하한 아래 남은 행 %', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT source_key, cap_base, cap_base_origin, daily_request_target, pct_step FROM public.review_source_ramp WHERE cap_base IS NOT NULL ORDER BY 1;
--   -- 기대: googleplay origin 60 · cap_base 15 · target 7(50%). 차단 이력 없는 행은 origin = cap_base.
-- SELECT source_key, reason FROM public.review_source_ramp_log WHERE applied_by = 'human-migration 20261012000010';  -- 끌어올린 행 수만큼
-- 음성(롤백되는 형태):
-- BEGIN; UPDATE public.review_source_ramp SET cap_base_origin = 0 WHERE source_key = 'googleplay'; ROLLBACK;  -- 기대: 23514
