-- 롤백(붙여넣기용, 남헌이 SQL Editor 에서 실행): 새 표 3·뷰 4 만 지운다. 기존 표는 건드리지 않는다.
BEGIN;
DROP VIEW IF EXISTS public.outcome_pairs;
DROP VIEW IF EXISTS public.story_flow_cards;
DROP VIEW IF EXISTS public.ss_episode_tags_current;
DROP VIEW IF EXISTS public.ss_story_labels_current;
DROP TABLE IF EXISTS public.ss_episode_tags;
DROP TABLE IF EXISTS public.ss_story_labels;
DROP TABLE IF EXISTS public.ss_chapter_defs;
COMMIT;
-- 잘못된 회차만 걷어내기(붙여넣기용): label_run 을 바꿔 실행. 에피소드를 먼저 지운다.
-- DELETE FROM public.ss_episode_tags WHERE label_run = '<RUN>';
-- DELETE FROM public.ss_story_labels WHERE label_run = '<RUN>';
