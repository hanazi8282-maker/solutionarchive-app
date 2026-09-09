-- ============================================================
-- 20260909000001_notion_sync_log
--
-- CMO 발행 대기함 ↔ Notion 동기화 1행 = 1페이지.
--
-- ⚠️ 미적용. 사람이 적용한다:
--     supabase db query --linked -f supabase/migrations/20260909000001_notion_sync_log.sql
--   선행: 20260827000002(posts.status), 20260906000002(posts pending_review).
--
-- 이 테이블이 답하는 질문
--   "그 초안을 Notion에 언제 뭘로 밀었고, 나중에 다시 읽었을 때 뭐가 바뀌어
--    있었나"를 1행에 담는다. `scripts/notion-push-digest.mjs`(아침)가 INSERT,
--    `scripts/notion-pull-feedback.mjs`(밤)가 같은 행을 UPDATE 한다.
--
-- ★ pushed_body 를 따로 스냅샷하는 이유.
--   Notion 페이지 본문은 사람이 고칠 수 있다. "원래 뭐였는지"를 SolutionArchive
--   쪽 posts.body 에만 의존하면, 그 사이 posts.body 자체가 재채점/정정으로
--   바뀔 경우(있었던 일이다 — L-63 참조) diff 기준이 조용히 움직인다.
--   push 시점 스냅샷을 별도로 굳혀야 diff 가 "그날 실제로 무엇이 바뀌었나"를
--   말한다.
--
-- ★ decision_log_code 는 post_decision_link 와 같은 형식 CHECK 를 그대로
--   가져왔다(§ 새 방식 발명 금지). 정본 판정 전문은 여기가 아니라
--   reports/<날짜>/notion-feedback-log.md 에 append-only 로 쓴다 — 이 컬럼은
--   그 로그 엔트리를 가리키는 포인터일 뿐이다.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notion_sync_log (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid()
                                  CONSTRAINT notion_sync_log_pkey PRIMARY KEY,

  post_id             uuid        NOT NULL
                                  REFERENCES public.posts(id) ON DELETE CASCADE,

  notion_database_id  text        NOT NULL,
  notion_page_id      text        NOT NULL
                                  CONSTRAINT notion_sync_log_page_key UNIQUE,
  notion_page_url     text,

  -- 푸시 시점 스냅샷. posts.body 가 나중에 바뀌어도 이 값은 안 바뀐다.
  pushed_body         text        NOT NULL,
  pushed_status       text        NOT NULL DEFAULT '검토중',
  pushed_at           timestamptz NOT NULL DEFAULT now(),

  -- 풀백(밤) 결과. 아직 안 읽었으면 전부 NULL — "무변경"과 "아직 확인 안 함"을
  -- 섞지 않는다(§7.1).
  pulled_body         text,
  pulled_status       text,
  diff_status         text,
  pulled_at           timestamptz,

  decision_log_code   text,

  CONSTRAINT notion_sync_log_diff_status_check
    CHECK (diff_status IS NULL OR diff_status IN ('unchanged', 'edited', 'adopted', 'held')),

  CONSTRAINT notion_sync_log_decision_log_code_check
    CHECK (decision_log_code IS NULL OR decision_log_code ~ '^(LOG|UPD|NEW|XUP)-[0-9]{8}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS notion_sync_log_post_idx
  ON public.notion_sync_log (post_id);
CREATE INDEX IF NOT EXISTS notion_sync_log_pulled_at_idx
  ON public.notion_sync_log (pulled_at)
  WHERE pulled_at IS NULL;

COMMENT ON TABLE public.notion_sync_log IS
  'CMO 발행 대기함(Notion DB) 동기화 1행 = 1페이지. 아침 push 가 INSERT, 밤 pull 이 같은 행을 UPDATE.';
COMMENT ON COLUMN public.notion_sync_log.pushed_body IS
  '푸시 시점 posts.body 스냅샷. 이후 posts.body 가 바뀌어도 불변 — diff 기준을 고정한다.';
COMMENT ON COLUMN public.notion_sync_log.decision_log_code IS
  '정본은 reports/<날짜>/notion-feedback-log.md 의 LOG-YYYYMMDD-NN 엔트리. 여기는 포인터만.';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 확인 쿼리 (적용 후 대시보드에서 직접 돌려볼 것) — 양성·음성 둘 다 본다(§7.1)
-- ────────────────────────────────────────────────────────────
--
-- 테이블·제약 존재:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notion_sync_log' ORDER BY ordinal_position;
--
-- diff_status 어휘 밖 값 거절 (ERROR 23514 기대):
--   INSERT INTO public.notion_sync_log (post_id, notion_database_id, notion_page_id, pushed_body, diff_status)
--   SELECT id, 'x', 'test-page-id', 'x', 'maybe' FROM public.posts LIMIT 1;
--
-- decision_log_code 형식 밖 값 거절 (ERROR 23514 기대):
--   INSERT INTO public.notion_sync_log (post_id, notion_database_id, notion_page_id, pushed_body, decision_log_code)
--   SELECT id, 'x', 'test-page-id-2', 'x', 'R-01' FROM public.posts LIMIT 1;
--
-- 정상 INSERT 통과 (양성):
--   INSERT INTO public.notion_sync_log (post_id, notion_database_id, notion_page_id, pushed_body)
--   SELECT id, 'x', 'test-page-id-3', 'x' FROM public.posts LIMIT 1;
--   DELETE FROM public.notion_sync_log WHERE notion_page_id LIKE 'test-page-id%';
