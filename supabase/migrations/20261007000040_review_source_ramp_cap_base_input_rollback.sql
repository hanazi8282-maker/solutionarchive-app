-- 롤백: 20261007000040_review_source_ramp_cap_base_input
-- (1) 18개 source_key 의 review_source_ramp 행을 지운다. reason 조건은 두지 않는다 — 엔진이 rise/block 으로 reason 을 바꾼 행이
--     롤백 뒤에 남아 반쪽 롤백이 되는 것을 막기 위함. 근거: 적용 전 review_source_ramp 0행(2026-10-07 CEO-STAFF 실측)이고
--     이 18개 키에 행을 INSERT 하는 다른 코드 경로가 없다(Opus 사전점검).
-- (2) googleplay daily_request_cap 을 60 → 40(이전 값)으로 복원. 현재값 60 가드 — 그사이 다른 값이면 건드리지 않고 아래 DO 블록이 예외로 알린다.
-- 사실: review_source_ramp_log 는 지우지 않는다(감사 로그, source_key FK 없음). 엔진이 쓴 'start' 등의 행이 롤백 뒤 고아로 남는다 — 기능상 해 거의 없음.
-- 롤백 실행은 사람 판단.

BEGIN;

DELETE FROM public.review_source_ramp
 WHERE source_key IN ('appstore','hackernews','82cook','damoang','theqoo','bobaedream','clien','fmkorea','okky','velog',
                      'youtube','brunch','tumblbug','disquiet','devto','yozm','indiehackers','googleplay');

UPDATE public.review_sources SET daily_request_cap = 40 WHERE key = 'googleplay' AND daily_request_cap = 60;

DO $$
DECLARE n int; gp int;
BEGIN
  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE source_key IN ('appstore','hackernews','82cook','damoang','theqoo','bobaedream','clien','fmkorea','okky','velog',
                        'youtube','brunch','tumblbug','disquiet','devto','yozm','indiehackers','googleplay');
  IF n <> 0 THEN RAISE EXCEPTION '롤백 후 18키 행 % 개 남음(기대 0)', n; END IF;
  SELECT daily_request_cap INTO gp FROM public.review_sources WHERE key = 'googleplay';
  IF gp IS DISTINCT FROM 40 THEN RAISE EXCEPTION 'googleplay daily_request_cap=%(기대 40)', gp; END IF;
END $$;

COMMIT;

-- 확인:
-- SELECT count(*) FROM public.review_source_ramp;                                   -- 기대: 0
-- SELECT daily_request_cap FROM public.review_sources WHERE key = 'googleplay';     -- 기대: 40
