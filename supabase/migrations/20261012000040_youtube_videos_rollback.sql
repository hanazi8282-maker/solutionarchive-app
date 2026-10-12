-- 롤백: 20261012000040_youtube_videos
-- 신규 테이블 하나를 지운다(DROP TABLE — 롤백 전용, 실행은 사람 판단). 다른 표는 이 표를 참조하지 않는다.
-- 지워도 원문(analysis_inputs)·판정(review_relevance_verdicts)은 그대로다. 제목은 scripts/youtube-video-titles.mjs 로 다시 받는다.

BEGIN;

DROP TABLE IF EXISTS public.youtube_videos;

COMMIT;

-- 확인: SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='youtube_videos';  -- 기대 0
