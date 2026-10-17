-- 20261017000110_github_issues_source 롤백 — github_issues 를 끄고 퍼센트 램프를 멈춘다. 멱등.
-- 행 DELETE 가 아니라 enabled=false: 수집이 돌았으면 review_targets·analysis_inputs·지문이 source_key 로 이 행을 가리킨다.
-- 꺼진 소스는 러너가 0요청으로 건너뛴다. 수집분 삭제(소스 단위 purge)·새로 만든 collecting 프로젝트 삭제는 사람 판단(§10.2 예외 1).
-- review_source_ramp 행은 지우지 않는다: cap_base·daily_request_target NULL(퍼센트 램프 정지) + frozen_until 먼 미래.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261017000110 롤백 — v71ad GitHub 공개 이슈 소스 중단',
       disabled_at = now()
 WHERE key = 'github_issues';

UPDATE public.review_source_ramp
   SET cap_base = NULL,
       daily_request_target = NULL,
       frozen_until = '2099-12-31T00:00:00Z',
       changed_at = now(),
       reason = '20261017000110 롤백 — 퍼센트 램프 정지(cap_base NULL)·동결'
 WHERE source_key = 'github_issues';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE key = 'github_issues' AND enabled;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 켜져 있는 행 %', n; END IF;
  SELECT count(*) INTO n FROM public.review_source_ramp WHERE source_key = 'github_issues' AND cap_base IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 cap_base 가 남은 램프 행 %', n; END IF;
END $$;

COMMIT;

-- 확인:
--   SELECT key, enabled, disabled_reason FROM public.review_sources WHERE key = 'github_issues';
