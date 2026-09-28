-- /relevance/grade 카드의 한국어 번역·제품 배경 캐시 (relevance_translations · relevance_product_backgrounds)
--
-- 근거: 남헌 2026-09-29 — 영어 VOC 를 채점할 때마다 다른 채팅에 복사해 번역·맥락을 묻던 것을 화면에 넣는다.
--   리뷰 1건 = 번역 1행(스레드 제목 번역은 같은 스레드끼리 재사용) · 프로젝트 1건 = 배경 1행. 한 번 만든 것은 다시 부르지 않는다.
--   prompt_version 이 코드(lib/relevance-feedback/translate.ts TRANSLATE_PROMPT_VERSION)와 다르면 배치가 다시 만든다.
--
-- ⛔ 채점 독립성: 이 두 테이블에는 판정(verdict) 계열 컬럼이 없다. 번역·배경은 순수 사실이어야 하고(프롬프트 제한 + 사후검사),
--    검사에 걸린 출력은 status='failed' 로만 남고 본문(text_ko/background)은 NULL 이다 — 오염된 글을 화면에 올리지 않는다.
--
-- 🟢 비파괴. 신규 테이블 2개(CREATE TABLE IF NOT EXISTS) + 트리거 함수 1개. 기존 테이블의 행·컬럼은 건드리지 않는다.
--    트리거는 analysis_inputs 의 **원문 폐기(raw_text → NULL, lib/review/purge.ts)** 를 따라 번역 행을 지우는 용도다 —
--    원문을 폐기하는 이유(보관 기한)가 번역본에도 그대로 적용돼야 하므로. 원문이 남아 있는 행에는 아무 일도 하지 않는다.
--    롤백 파일 있음(`_rollback.sql` — 트리거·함수·테이블 2개 DROP, 캐시만 사라진다).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 기존 데이터 삭제 없음(트리거는 새 테이블의 행만 지운다) · 기존 행 변경 없음 ·
--    인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260915000002). 트리거 함수는 SECURITY INVOKER(기본) +
--      search_path 고정(어드바이저 function_search_path_mutable, 20260927000002 와 같은 방식).
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 미적용이어도 화면은 돈다 — 카드에 "번역 미적용(마이그 000036 전)" 만 뜬다.
--   절차: 1) solutionarchive qmgrfqjfxqhxuufrnkwf 확인 2) information_schema 로 부재 확인 3) 실행 → 하단 확인 쿼리
--         4) docs/migration-exceptions.md 한 줄 5) 워크플로 relevance-translate.yml 을 workflow_dispatch(dry_run=false)로 1회 → 첫 백필.

CREATE TABLE IF NOT EXISTS public.relevance_translations (
  -- 원문 행이 지워지면 번역도 같이 간다(프로젝트 삭제 CASCADE 경로).
  input_id        uuid PRIMARY KEY REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  source_key      text,
  -- 어느 스레드에 달린 댓글인가(HN story id · PH 슬러그 · YouTube videoId). 제목 번역 재사용 키.
  thread_key      text,
  -- 저장돼 있던 원제(HN 만). PH·YouTube 는 어댑터가 제목을 싣지 않아 NULL 이다 — 지어내지 않는다.
  thread_title    text,
  thread_title_ko text,
  text_ko         text,
  status          text NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  fail_reason     text,
  model           text,
  prompt_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- ok 면 본문이 있어야 하고, 아니면 본문이 없어야 한다 — "실패인데 오염된 본문이 남는" 상태를 DB 가 막는다.
  CONSTRAINT relevance_translations_body_matches_status
    CHECK ((status = 'ok') = (text_ko IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_relevance_translations_thread
  ON public.relevance_translations (source_key, thread_key)
  WHERE thread_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.relevance_product_backgrounds (
  project_id      uuid PRIMARY KEY REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  background      text,
  status          text NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  fail_reason     text,
  model           text,
  prompt_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relevance_product_backgrounds_body_matches_status
    CHECK ((status = 'ok') = (background IS NOT NULL))
);

ALTER TABLE public.relevance_translations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relevance_translations        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.relevance_product_backgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relevance_product_backgrounds FORCE  ROW LEVEL SECURITY;

-- 원문 폐기를 따라간다. purge 는 DELETE 가 아니라 raw_text=NULL UPDATE 라 FK CASCADE 가 안 걸린다 — 그래서 트리거다.
CREATE OR REPLACE FUNCTION public.relevance_translations_follow_purge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.raw_text IS NULL AND OLD.raw_text IS NOT NULL THEN
    DELETE FROM public.relevance_translations WHERE input_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relevance_translations_follow_purge ON public.analysis_inputs;
CREATE TRIGGER relevance_translations_follow_purge
  AFTER UPDATE OF raw_text ON public.analysis_inputs
  FOR EACH ROW EXECUTE FUNCTION public.relevance_translations_follow_purge();

COMMENT ON TABLE public.relevance_translations IS
  '/relevance/grade 카드의 한국어 번역 캐시(리뷰 1건 1행). 순수 번역만 — 판정 컬럼 없음. failed/skipped 면 text_ko NULL. 원문 폐기(raw_text NULL)를 트리거가 따라간다. 정책 0개 = service_role 전용.';
COMMENT ON TABLE public.relevance_product_backgrounds IS
  '/relevance/grade 카드의 제품 배경(프로젝트 1건 1행, "무엇이고 무엇을 하는가" 사실만). failed/skipped 면 background NULL. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.relevance_translations.prompt_version IS
  'lib/relevance-feedback/translate.ts TRANSLATE_PROMPT_VERSION. 다르면 배치(scripts/relevance-translate.mjs)가 다시 만든다.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select table_name, count(*) from information_schema.columns
--    where table_schema='public' and table_name in ('relevance_translations','relevance_product_backgrounds') group by 1;  -- 11 / 7
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relname in ('relevance_translations','relevance_product_backgrounds');                                          -- true/true ×2
--   select count(*) from pg_policies where tablename in ('relevance_translations','relevance_product_backgrounds');        -- 0
--   select proname, proconfig from pg_proc where proname='relevance_translations_follow_purge';                             -- {search_path=public, pg_temp}
--   select tgname, tgenabled from pg_trigger where tgname='relevance_translations_follow_purge';                            -- O
-- ── 음성 (롤백되는 형태) ──
--   begin; insert into public.relevance_translations (input_id, status, prompt_version)
--     select id, 'ok', 'x' from public.analysis_inputs limit 1; rollback;                                                   -- 기대: ERROR 23514 (ok 인데 본문 없음)
--   begin; insert into public.relevance_translations (input_id, status, text_ko, prompt_version)
--     select id, 'failed', '오염', 'x' from public.analysis_inputs limit 1; rollback;                                       -- 기대: ERROR 23514 (failed 인데 본문 있음)
--   begin; insert into public.relevance_product_backgrounds (project_id, status, prompt_version)
--     select id, 'bogus', 'x' from public.analysis_projects limit 1; rollback;                                              -- 기대: ERROR 23514
-- ── 트리거 (롤백되는 형태) ──
--   begin;
--     insert into public.relevance_translations (input_id, status, text_ko, prompt_version)
--       select id, 'ok', 't', 'x' from public.analysis_inputs where raw_text is not null limit 1;
--     -- purge.ts 와 같은 모양(000015 불변식: raw_text NULL ⇒ purged_at·purge_reason 필요)
--     update public.analysis_inputs set raw_text = null, purged_at = now(), purge_reason = 'retention'
--      where id = (select input_id from public.relevance_translations where prompt_version='x');
--     select count(*) from public.relevance_translations where prompt_version='x';                                          -- 기대: 0
--   rollback;
