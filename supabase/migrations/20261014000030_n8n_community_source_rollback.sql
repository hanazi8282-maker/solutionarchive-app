-- 20261014000030_n8n_community_source 롤백 — n8n_community 를 끄고 약관 예외 기록을 거둔다. 멱등.
-- 행 DELETE 가 아니라 enabled=false: 수집이 돌았으면 review_targets·analysis_inputs·지문이 source_key 로 이 행을 가리킨다.
-- 꺼진 소스는 러너가 0요청으로 건너뛴다(runner.ts '소스가 비활성 상태다'). 수집분 삭제(소스 단위 purge)는 사람 판단(§10.2 예외 1) 또는 v70 purge 스크립트.
-- override 를 NULL 로 비워 누가 enabled 만 다시 올려도 "예외 기록 없는 약관 금지 소스"로 보이게 한다(target-supply tos_flag).
-- review_source_ramp 행은 지우지 않는다: cap_base·daily_request_target NULL(퍼센트 램프 정지) + frozen_until 먼 미래.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       override = NULL,
       disabled_reason = '20261014000030 롤백 — v70 E2E n8n 커뮤니티 소스 중단'
 WHERE key = 'n8n_community';

UPDATE public.review_source_ramp
   SET cap_base = NULL,
       daily_request_target = NULL,
       frozen_until = '2099-12-31T00:00:00Z',
       changed_at = now(),
       reason = '20261014000030 롤백 — 퍼센트 램프 정지(cap_base NULL)·동결'
 WHERE source_key = 'n8n_community';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE key = 'n8n_community' AND (enabled OR override IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 켜져 있거나 override 가 남은 행 %', n; END IF;
  SELECT count(*) INTO n FROM public.review_source_ramp WHERE source_key = 'n8n_community' AND cap_base IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 cap_base 가 남은 램프 행 %', n; END IF;
END $$;

COMMIT;

-- 확인:
--   SELECT key, enabled, override, disabled_reason FROM public.review_sources WHERE key = 'n8n_community';
