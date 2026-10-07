-- 롤백: 20261007000040_review_source_ramp_cap_base_input
-- (1) 이 마이그가 만든 18행만 지운다 — reason 이 입력 문구 그대로인 행. 엔진이 단계를 올리거나(rise) 차단으로 내렸다면(block)
--     reason 이 바뀌어 이 DELETE 에서 빠진다 → 그 행은 이미 운영 상태이므로 사람이 보고 지운다(아래 확인 쿼리의 남는 행).
-- (2) googleplay daily_request_cap 을 60 → 40(이전 값)으로 복원. 현재값 60 가드(그사이 다른 값이면 건드리지 않는다).
-- review_source_ramp_log 는 지우지 않는다(감사 로그 — 엔진이 쓴 'start' 등이 남는다).
-- review_source_ramp 가 마이그 전 0행이었음은 2026-10-07 CEO-STAFF 실측. 롤백 실행은 사람 판단.

BEGIN;

DELETE FROM public.review_source_ramp
 WHERE reason = '남헌 승인 2026-10-07 v32 — cap_base 입력(v28 #1)'
   AND source_key IN ('appstore','hackernews','82cook','damoang','theqoo','bobaedream','clien','fmkorea','okky','velog',
                      'youtube','brunch','tumblbug','disquiet','devto','yozm','indiehackers','googleplay');

UPDATE public.review_sources SET daily_request_cap = 40 WHERE key = 'googleplay' AND daily_request_cap = 60;

COMMIT;

-- 확인:
-- SELECT count(*) FROM public.review_source_ramp;                                   -- 기대: 0 (엔진이 reason 을 바꾼 행이 있으면 그 수)
-- SELECT daily_request_cap FROM public.review_sources WHERE key = 'googleplay';     -- 기대: 40
