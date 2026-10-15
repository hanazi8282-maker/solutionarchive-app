-- bobaedream 빈도 낮춤 되돌리기 (남헌 승인 2026-10-15 v71u 4 ③, 실행: CC 대화형 세션)
-- 변경 전: cap_base 336 · cap_base_origin 336 · daily_request_target 168 · pct_step 50 · changed_at 2026-10-07T10:16:24.376157+00:00
-- 변경 후: cap_base 168 · cap_base_origin 168 · daily_request_target 84  (pct_step 50 유지, review_sources.daily_request_cap 336 불변)
-- 이유: 14일 실측 bobaedream 3,556건 중 86% 가 60자 미만(평균 48자), 요청 836번. 내용이 얇은 소스의 요청을 절반으로.
-- cap_base_origin 도 같이 낮춘 이유: 차단 없이 연속 정상 3일이면 capRecovery 가 cap_base 를 origin(336)까지 되돌려 버린다(lib/review/ramp.ts capRecovery).
UPDATE public.review_source_ramp
   SET cap_base = 336, cap_base_origin = 336, daily_request_target = 168,
       changed_at = '2026-10-07T10:16:24.376157+00:00',
       reason = '남헌 승인 2026-10-07 v32 — cap_base 입력(v28 #1)'
 WHERE source_key = 'bobaedream' AND cap_base = 168 AND cap_base_origin = 168;
-- 확인: SELECT source_key, cap_base, cap_base_origin, daily_request_target FROM public.review_source_ramp WHERE source_key='bobaedream';
-- 로그 행(review_source_ramp_log, applied_by 'cc-session v71u')은 이력이므로 지우지 않는다. 되돌린 뒤 같은 형식의 행을 하나 더 남긴다.
