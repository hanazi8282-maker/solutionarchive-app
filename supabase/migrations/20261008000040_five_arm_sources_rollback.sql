-- 롤백: 20261008000040_five_arm_sources — wordpress_org·shopify_apps 를 끄고 Shopify 소유자 예외를 거둔다.
--
-- 행 DELETE 가 아니라 enabled=false 다: 적용 뒤 수집이 돌았으면 review_targets·analysis_inputs·지문이 source_key 로 이 행을 가리킨다.
-- 행·데이터 삭제는 사람 판단(§10.2 예외 1). 꺼진 소스는 러너가 0요청으로 건너뛴다(runner.ts '소스가 비활성 상태다').
-- shopify_apps 의 override 를 NULL 로 비운다 — 누가 enabled 만 다시 올려도 "예외 기록 없는 약관 금지 소스"로 보이게(target-supply tos_flag).
-- robots_status·tos_status 는 실측·약관 사실이라 그대로 둔다.
-- review_source_ramp 2행은 **지우지 않는다**(삭제 금지 지시, v37 독립 검토). cap_base·daily_request_target 을 NULL 로 두어 퍼센트 램프를
--   멈추고(ramp.ts toRamp: cap_base NULL = 미가동) frozen_until 을 먼 미래로 둔다(자동 상승 없음). review_source_ramp_log 도 그대로.
-- 타깃·프로젝트는 그대로 둔다(소스가 꺼지면 요청 0). 지우려면 사람 판단.
-- 롤백 실행 자체는 오케스트레이터·사람 판단. 이 파일은 멱등이다(두 번 돌려도 같은 상태).

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       override = CASE WHEN key = 'shopify_apps' THEN NULL ELSE override END,
       disabled_reason = '20261008000040 롤백 — 영역 ⑤ 3갈래 시험 소스 중단'
 WHERE key IN ('wordpress_org', 'shopify_apps');

UPDATE public.review_source_ramp
   SET cap_base = NULL,
       daily_request_target = NULL,
       frozen_until = '2099-12-31T00:00:00Z',
       changed_at = now(),
       reason = '20261008000040 롤백 — 퍼센트 램프 정지(cap_base NULL)·동결'
 WHERE source_key IN ('wordpress_org', 'shopify_apps');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE key IN ('wordpress_org', 'shopify_apps') AND (enabled OR override IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 켜져 있거나 override 가 남은 행 %', n; END IF;
  SELECT count(*) INTO n FROM public.review_source_ramp WHERE source_key IN ('wordpress_org', 'shopify_apps') AND cap_base IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 cap_base 가 남은 램프 행 %', n; END IF;
END $$;

COMMIT;

-- 확인:
--   SELECT key, enabled, override, disabled_reason FROM public.review_sources WHERE key IN ('wordpress_org','shopify_apps');
--   -- 기대: 둘 다 false · NULL · '20261008000040 롤백 …' (적용 전이었으면 0행 — UPDATE 0행도 정상)
--   다음 수집 요약에 두 소스 "건너뜀 — 소스가 비활성 상태다".
