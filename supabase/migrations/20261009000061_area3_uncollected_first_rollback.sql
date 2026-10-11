-- 20261009000061 롤백 — 아직 방문 전(last_run_at NULL)인 대상 행을 맨 뒤 순서(now())로 돌린다.
-- 원래 시각은 정방향 NOTICE 에 있다. 정확히 되돌리려면 그 값을 행별로 넣는다 — 정렬 키일 뿐이라 now() 로도 효과는 같다(앞순위 해제).
BEGIN;
UPDATE public.review_targets SET last_run_at = now()
 WHERE source_key IN ('appstore', 'googleplay')
   AND status = 'active' AND total_collected = 0 AND last_run_at IS NULL
   AND label ~ '^3:(us\||us-en\|)?(adcreative-ai|foreplay|motion-creative|simplified|predis-ai)$';
COMMIT;
