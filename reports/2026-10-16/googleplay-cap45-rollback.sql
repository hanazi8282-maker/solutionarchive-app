-- 구글 플레이 하루 목표 30 → 45 되돌리기 (남헌 승인 2026-10-15/16 v71v 4 + v71x 3, 실행: CC 대화형 세션)
-- 변경 전: review_source_ramp(googleplay) cap_base 60 · cap_base_origin 60 · daily_request_target 30 · pct_step 50
--          review_sources(googleplay) daily_request_cap 60   (하드 상한 = floor(60/2) = 30, robots 금지 소스 저속 계수 2)
-- 변경 후: cap_base 90 · cap_base_origin 90 · daily_request_target 45 · daily_request_cap 90 (하드 상한 45)
-- 이유: 활성 85개를 한 바퀴 도는 데 약 106요청이 필요한데 하루 30이라 약 3.5일. 45면 약 2.4일.
-- cap_base_origin 도 같이 올린 이유: 차단 없이 연속 정상 3일이면 capRecovery 가 cap_base 를 origin 까지 되돌린다(lib/review/ramp.ts).
-- daily_request_cap 도 올린 이유: 러너 하드 상한이 floor(daily_request_cap/2)라 목표만 45 로 올리면 30 에서 막힌다.
-- 원복은 세 값 모두(cap_base · cap_base_origin · daily_request_cap) + 목표.
UPDATE public.review_source_ramp
   SET cap_base = 60, cap_base_origin = 60, daily_request_target = 30,
       changed_at = '2026-10-14T07:53:44.544+00:00',
       reason = 'v50 하한 끌어올리기 1→15(원래 60의 25%) — 마이그 20261012000010'
 WHERE source_key = 'googleplay' AND cap_base = 90 AND cap_base_origin = 90;
UPDATE public.review_sources
   SET daily_request_cap = 60
 WHERE key = 'googleplay' AND daily_request_cap = 90;
-- 확인: SELECT r.source_key, r.cap_base, r.cap_base_origin, r.daily_request_target, s.daily_request_cap
--         FROM public.review_source_ramp r JOIN public.review_sources s ON s.key = r.source_key WHERE r.source_key = 'googleplay';
-- 로그 행(review_source_ramp_log, applied_by 'cc-session v71v')은 이력이므로 지우지 않는다. 되돌린 뒤 같은 형식의 행을 하나 더 남긴다.
