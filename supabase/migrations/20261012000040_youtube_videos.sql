-- ============================================================
-- 20261012000040_youtube_videos — YouTube 영상 제목·채널 (댓글 판정 맥락용)
--
-- ⛔ **미적용**. 서브에이전트가 파일만 만들었다(CLAUDE.md §10.2) — 적용은 대화형·역할 세션 자체 판단:
--    신규 테이블 1개 · 비파괴 · 롤백 파일 있음(20261012000040_youtube_videos_rollback.sql) · 기존 행 무변경.
--    적용 후 `docs/migration-exceptions.md` 에 한 줄.
--
-- 왜: 유튜브 댓글(analysis_inputs.source_key='youtube')은 본문 머리말에 영상 ID 만 있고 제목이 없다
--     (commentThreads.list 응답에 제목이 없다 — lib/review/adapters/youtube.ts). 영상은 20개 안팎이라
--     videos.list 1회로 채운다(scripts/youtube-video-titles.mjs). 판정 프롬프트 주입은 옵션(기본 off).
-- 쓰는 곳: scripts/youtube-video-titles.mjs(upsert, 사람이 실행) · scripts/youtube-title-ab-measure.mjs(읽기).
-- summary_line 은 비워 둔다(사람·후속 작업 몫). 업서트가 덮지 않는다.
-- RLS on + FORCE + 정책 0 = service_role 전용(CLAUDE.md §5-1, review_relevance_verdicts 와 같은 형태).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.youtube_videos (
  video_id         text PRIMARY KEY CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title            text NOT NULL,
  channel          text,
  description_head text CHECK (description_head IS NULL OR char_length(description_head) <= 500),
  summary_line     text,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_videos FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.youtube_videos IS
  'YouTube 영상 메타(videos.list snippet). 댓글 판정 맥락용. service_role 전용. 20261012000040';

COMMIT;

-- ── 양성 (적용 후) ──────────────────────────────────────────────
-- SELECT c.relrowsecurity, c.relforcerowsecurity, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
--   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'youtube_videos';   -- t · t · 0
-- SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'youtube_videos';  -- 6
-- ── 음성 (롤백되는 형태) ────────────────────────────────────────
-- BEGIN; INSERT INTO public.youtube_videos (video_id, title) VALUES ('https://youtu.be/x', 't'); ROLLBACK;  -- 23514
-- BEGIN; INSERT INTO public.youtube_videos (video_id, title) VALUES ('dQw4w9WgXcQ', NULL); ROLLBACK;       -- 23502
