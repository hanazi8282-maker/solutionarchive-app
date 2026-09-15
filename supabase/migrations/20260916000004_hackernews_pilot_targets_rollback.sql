-- 롤백 — 20260916000004_hackernews_pilot_targets.sql
--
-- ⚠️ 타깃만 지운다. **이미 수집된 analysis_inputs 는 지우지 않는다.**
--    타깃은 "앞으로 어디서 더 받을까"이고 적재된 리뷰는 관측 결과다.
--    같이 지우면 롤백이 데이터 삭제가 된다.
--
--    적재분까지 지워야 한다면 원문 폐기 경로(scripts/review-purge.mjs)를
--    쓰거나 사람이 따로 판단한다.

DELETE FROM public.review_targets
 WHERE source_key = 'hackernews'
   AND label LIKE 'HN 파일럿 —%';

-- 확인용:
--   select count(*) from public.review_targets
--    where source_key = 'hackernews' and label like 'HN 파일럿 —%';
-- 기대: 0
