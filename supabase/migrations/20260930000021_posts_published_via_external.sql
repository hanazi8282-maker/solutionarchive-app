-- ============================================================
-- 20260930000021_posts_published_via_external
--
-- posts.published_via 에 'external' 값 허용 — 파이프라인 밖(초안 없음)에서 사람이 쓰고 Threads 에 직접 게시한 글.
-- 남헌 2026-09-27 확정: 대시보드 "미연결" 4건은 솔파 CMO 산출물이 아니라 별도 Claude 세션 첨삭본이다.
-- 이 값이 있어야 (a) 발행 통계에 들어가면서도 파이프라인 발행과 구분되고 (b) 매처가 미연결로 세지 않는다.
--
-- 🟢 비파괴. CHECK 를 넓히기만 한다(기존 값 instant/manual/NULL 전부 그대로 통과). Postgres 는 CHECK 를
--    in-place 로 못 넓혀 DROP → ADD 순서다(20260906000002 와 같은 패턴). 짧은 DDL 락 1회, 무중단.
-- 롤백: 20260930000021_posts_published_via_external_rollback.sql
-- ============================================================

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_published_via_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_published_via_check
    CHECK (published_via IS NULL OR published_via IN ('instant', 'manual', 'external'));

COMMENT ON COLUMN public.posts.published_via IS
  'instant = 대시보드 "그대로 발행" 버튼(사람이 누름) · manual = 파이프라인 초안을 사람이 Threads 앱에서 게시(매처 연결) · external = 초안 없이 파이프라인 밖에서 쓰고 직접 게시(2026-09-27~). NULL = 도입 전.';

-- 확인 쿼리
--   양성: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='posts_published_via_check';  -- 'external' 포함
--   음성: INSERT 로 published_via='auto' 를 넣으면 여전히 CHECK 위반이어야 한다(트랜잭션 안에서 ROLLBACK).
