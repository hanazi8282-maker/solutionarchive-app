-- ============================================================
-- posts.status 에 'pending_review' 추가 — 게이트를 통과한 발행-대기 초안
--
-- 왜 'draft' 로 안 되는가
--   지금 vocabulary 는 draft / published / discarded 셋이다. 그런데 'draft' 가
--   두 가지 서로 다른 상태를 덮고 있다:
--     (a) 아직 게이트를 안 돌린 생초안
--     (b) 게이트를 통과하고 판정 로그·예측까지 붙어서 사람이 발행 버튼만
--         누르면 되는 초안
--   (a)(b) 를 같은 값으로 두면 "발행 대기가 몇 건인가"를 물을 수가 없고,
--   더 나쁘게는 (a) 를 실수로 발행할 수 있다. 상태를 나눈다.
--
-- ⚠️ 이 값이 '발행됨' 을 뜻하지 않는다.
--   CLAUDE.md §10 — 자동 발행 API 사용 안 함. pending_review 는 **사람이
--   Threads 앱에서 직접 게시하기 직전까지** 라는 뜻이고, 그 다음 전이
--   (pending_review → published) 도 사람이 발행한 뒤에 기록하는 것이다.
--   어떤 자동화도 이 값을 보고 게시해서는 안 된다.
--
-- 전이:  draft → pending_review → published
--                             └→ discarded
--
-- 가역: 동명 rollback 파일 참조(20260906000002_posts_pending_review_rollback.sql).
--       되돌리기 전에 pending_review 행을 draft 로 내려야 CHECK 재생성이 된다.
-- ============================================================

BEGIN;

-- ── 1) CHECK 교체 ────────────────────────────────────────────
-- DROP → ADD 순서로 한다. Postgres 는 CHECK 를 in-place 로 못 넓힌다.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
    CHECK ((status = ANY (ARRAY[
      'draft'::text,
      'pending_review'::text,
      'published'::text,
      'discarded'::text
    ])));

-- ── 2) published_at 규약은 그대로 ────────────────────────────
-- posts_published_at_required 는 status <> 'published' 를 통과시키므로
-- pending_review 행은 published_at 이 NULL 이어도 된다. 그게 맞다 —
-- 발행 시각은 사람이 실제로 게시한 뒤에 생긴다. 여기서 손대지 않는다.

COMMENT ON COLUMN public.posts.status IS
  'draft=생초안 / pending_review=게이트 통과한 발행-대기(사람이 직접 게시) / published=게시 완료 / discarded=폐기. §10 자동 발행 금지.';

COMMIT;

-- 확인 쿼리 (대시보드에서 함께 돌린다)
--   SELECT status, count(*) FROM public.posts GROUP BY status;
--   INSERT ... status='pending_reviw' (오타) 가 23514 로 막히는지도 한 번 본다.
