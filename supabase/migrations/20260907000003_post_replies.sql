-- 20260907000003_post_replies.sql
--
-- 발행한 글에 달린 답글(댓글) 본문을 적재한다. collect-metrics 가 답글 "개수"만
-- 스냅샷하는 것과 별개로, 여기는 "내용"이다.
--
-- 왜 필요한가: pdp/04-decisions.md NEW-20260907-01 이 "관찰 입력을 남의 글 댓글에서
--   내 글 1차 반응으로 전환한다" 고 판단했는데, 그 1차 반응(내 글 답글 실물)을
--   담을 자리가 없었다. Threads API 는 GET /{media-id}/conversation 으로 내 글 답글을
--   전문 준다(2026-09-07 실호출 확인). 이 테이블이 그 소비처다.
--
-- ⛔ 이 마이그레이션은 스키마만 만든다. 수집은 /api/threads/collect-replies 라우트가 한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_replies (
  -- Threads 답글의 media id. 재수집 시 중복 방지의 근거라 PK 로 쓴다.
  id               text PRIMARY KEY,

  post_id          uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,

  -- 무엇에 대한 답글인가. NULL = 원글(post_id)에 직접 단 답글.
  -- 값이 있으면 다른 답글의 id(중첩). conversation 응답의 replied_to 에서 온다.
  parent_id        text,

  author_username  text,

  -- @solution_arch_ 본인이 단 답글인가. 자기답글(고정 댓글)·후속 답글 식별용.
  -- conversation 의 is_reply_owned_by_me 를 그대로 담는다.
  is_own           boolean NOT NULL DEFAULT false,

  -- 댓글 본문. Threads 가 text 를 안 주는 경우(이미지 전용 등)엔 NULL.
  text             text,

  -- API timestamp (그 답글이 달린 시각).
  replied_at       timestamptz,

  permalink        text,

  -- visible / hidden 등. 작성자가 숨기거나 우리가 숨겼을 때 바뀐다.
  hide_status      text,

  -- 우리 수집 시각. first 는 불변, last 는 매 수집마다 갱신.
  -- 어느 시점 이후로 응답에 안 나오면(삭제) last_seen_at 이 멈춘다 — 그게 삭제 신호.
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),

  -- 모델링하지 않은 필드까지 원본을 통째로 남긴다.
  raw              jsonb
);

CREATE INDEX IF NOT EXISTS post_replies_post_id_idx    ON public.post_replies (post_id);
CREATE INDEX IF NOT EXISTS post_replies_replied_at_idx ON public.post_replies (replied_at);
CREATE INDEX IF NOT EXISTS post_replies_is_own_idx     ON public.post_replies (is_own);

COMMENT ON TABLE public.post_replies IS
  '발행 글에 달린 답글 본문. GET /{media-id}/conversation 로 수집. 개수 스냅샷은 metric_snapshots 가 따로 한다. NEW-20260907-01 의 관찰 입력 소스.';

COMMIT;

-- ============================================================
-- 적용 후 확인
-- ============================================================
--   node --env-file=.env.local -e "import('./lib/supabase/server.ts').then(async({createClient})=>{const db=await createClient();const r=await db.from('post_replies').select('id',{count:'exact'}).limit(0);console.log(r.error?r.error.message:('post_replies OK, '+r.count+'행'))})"
