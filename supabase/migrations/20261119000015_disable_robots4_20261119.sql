-- 끄는 짝(S5b): 디시인사이드·루리웹을 끈다. 모은 글·타깃은 지우지 않는다. 켜는 짝: 20261119000014_enable_robots4_20261119.sql
-- 다시 켜기: UPDATE public.review_sources SET enabled = true, disabled_reason = NULL, disabled_at = NULL WHERE override = 'owner_2026-11-19' AND key IN ('dcinside','ruliweb');
BEGIN;
UPDATE public.review_sources SET enabled = false, disabled_reason = 'owner_2026-11-19 robots4 끄기 (20261119000015)', disabled_at = now()
 WHERE override = 'owner_2026-11-19' AND key IN ('dcinside','ruliweb');
COMMIT;
