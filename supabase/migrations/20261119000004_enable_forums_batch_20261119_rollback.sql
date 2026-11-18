-- 롤백(S5-3 켜기): 아직 한 건도 안 모은 새 타깃만 지운다. 글이 있으면 지우지 않고 20261119000005(끄기)를 쓴다.
BEGIN;
DELETE FROM public.review_targets WHERE onboard_batch = 'onboard_20261119' AND total_collected = 0;
COMMIT;
