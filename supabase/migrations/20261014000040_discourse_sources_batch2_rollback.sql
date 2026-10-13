-- 20261014000040_discourse_sources_batch2 롤백 — 5개 포럼 소스를 끄고 약관 예외 기록을 거둔다. 멱등.
-- 행 DELETE 가 아니라 enabled=false(수집이 돌았으면 review_targets·analysis_inputs·지문이 source_key 로 가리킨다). 꺼진 소스는 러너가 0요청으로 건너뛴다.
-- 수집분 삭제(소스 단위 purge)는 사람 판단(§10.2 예외 1) 또는 v70 purge 스크립트. 새로 만든 프로젝트 4개와 타깃은 그대로 둔다(소스가 꺼지면 요청 0).
-- review_source_ramp 5행은 지우지 않는다: cap_base·daily_request_target NULL(퍼센트 램프 정지) + frozen_until 먼 미래.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       override = NULL,
       disabled_reason = '20261014000040 롤백 — v70 D3 Discourse 포럼 소스 중단'
 WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community');

UPDATE public.review_source_ramp
   SET cap_base = NULL,
       daily_request_target = NULL,
       frozen_until = '2099-12-31T00:00:00Z',
       changed_at = now(),
       reason = '20261014000040 롤백 — 퍼센트 램프 정지(cap_base NULL)·동결'
 WHERE source_key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community') AND (enabled OR override IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 켜져 있거나 override 가 남은 행 %', n; END IF;
  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE source_key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community') AND cap_base IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 cap_base 가 남은 램프 행 %', n; END IF;
END $$;

COMMIT;

-- 확인: SELECT key, enabled, override, disabled_reason FROM public.review_sources WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community');
