-- ============================================================
-- 20260930000002_case_saves
--
-- 케이스 저장(북마크) 한 자리. 신규 테이블 `case_saves` 하나뿐이다.
--   /library/<slug> 의 "저장" 토글 → 행 1개 INSERT/DELETE
--   /library/saved  의 목록      → 이 테이블을 읽는다
--
-- 근거: reports/2026-09-23/competitor-feature-analysis.md
--       ("Like/Save/Share 3버튼 — 사용자별 저장 테이블. 로그인 사용자 한정. 4h",
--        저비용 항목 1순위). 남헌 2026-09-23 트랙 4 지정.
--
-- 🟢 비파괴. CREATE TABLE IF NOT EXISTS 1개. 기존 행·컬럼·제약을 건드리지 않고
--    백필도 없다. 롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음:
--      삭제 없음 · 기존 데이터 손상 없음(UPDATE·백필 없음) · 인증 경계 안 건드림
--      (RLS ON+FORCE + 정책 0 = service_role 전용, 앱은 서버 액션으로만 읽고 쓴다) ·
--      새 수집 소스 아님 · 사업 방향 결정 아님.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가
--    아니다). 사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 이미 있는지 확인 — PostgREST head:true 는 없는 테이블에도
--         204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- 미적용 상태에서 화면은 죽지 않는다: `lib/cases/saves.ts` 가 42P01/PGRST205 를
-- **"저장 안 함"이 아니라 "기능이 아직 안 켜졌다"** 로 따로 판정하고(3상태),
-- 버튼·목록이 그 문장을 그대로 띄운다. 조용히 성공으로 접지 않는다(§7.1).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- case_saves — 사람 1명이 케이스 1건을 저장한 사실
--
-- 설계에서 갈린 것들:
--   · `user_email` 은 **NOT NULL** 이다. `case_feedback` 과 다르다 — 피드백은 나중에
--     익명도 받을 수 있는 신호지만, 저장은 "누구의 저장함인가"가 곧 이 행의 존재 이유다.
--     주인 없는 저장 행은 어느 목록에도 나타나지 않는 죽은 행이다.
--   · `unique(case_study_id, user_email)` 를 **건다**. 피드백과 반대다 — 피드백은 마음을
--     바꿔 다시 누른 것도 신호지만, 저장은 상태(있다/없다)라 두 번 누른 것이 두 행이 되면
--     "저장됨"이 몇 개인지 물어야 하는 질문이 된다. 토글 경합(더블클릭·두 탭)도 여기서
--     23505 로 막힌다 — 앱이 그걸 "이미 저장됨"으로 읽는다.
--   · 좋아요(like)를 따로 만들지 않는다. 지금 화면에 좋아요 수를 낼 자리가 없고,
--     집계를 보여주면 뒷사람이 앞사람의 숫자를 따라간다(피드백 위젯과 같은 이유).
--     필요해지면 `kind text NOT NULL DEFAULT 'save'` 한 컬럼을 더하고 unique 를
--     (case_study_id, user_email, kind) 로 넓히면 된다 — 지우는 변경이 아니다.
--
-- ON DELETE CASCADE: 케이스가 지워지면 그 저장도 뜻이 없다. 저장 행만 남으면 목록에서
-- 영영 "확인 불가"로 뜬다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260930000001 과 같다).
--   브라우저 번들의 anon 키로 남의 저장함을 읽는 경로를 막는다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_saves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id uuid NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  user_email    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_study_id, user_email)
);

COMMENT ON TABLE public.case_saves IS
  '케이스 저장(북마크). 행이 있으면 저장됨, 없으면 안 됨. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.case_saves.user_email IS
  '저장한 사람. NOT NULL — 주인 없는 저장 행은 어느 목록에도 안 나타난다(case_feedback 과 다른 이유).';

-- `/library/saved` 의 조회축: 내 저장 전부를 최근 순으로.
CREATE INDEX IF NOT EXISTS case_saves_user_idx
  ON public.case_saves (user_email, created_at DESC);

ALTER TABLE public.case_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_saves FORCE  ROW LEVEL SECURITY;

COMMIT;


-- ============================================================
-- 확인 쿼리 (적용 직후 실행) — 양성·음성 둘 다 돌린다.
-- "에러 안 났다"로 통과 처리하지 않는다. 막아야 할 것이 막히는지 본다(§7.1).
-- ============================================================
--
-- ── 양성 1) 컬럼 구성
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_saves' ORDER BY ordinal_position;
--   기대: 4행 (id uuid NO, case_study_id uuid NO, user_email text NO, created_at timestamptz NO)
--
-- ── 양성 2) RLS · 정책 0
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='case_saves';
--   기대: true / true
-- SELECT count(*) FROM pg_policies WHERE tablename='case_saves';
--   기대: 0 (service_role 전용)
--
-- ── 양성 3) 정상 저장 → 조회 → 해제 (롤백되는 형태로, 데이터를 남기지 않는다)
-- BEGIN;
--   INSERT INTO public.case_saves (case_study_id, user_email)
--     SELECT id, 'hanazi8282@gmail.com' FROM public.case_studies WHERE review_status='approved' LIMIT 1;
--   SELECT count(*) FROM public.case_saves WHERE user_email='hanazi8282@gmail.com';  -- 기대: 1
--   DELETE FROM public.case_saves WHERE user_email='hanazi8282@gmail.com';
--   SELECT count(*) FROM public.case_saves WHERE user_email='hanazi8282@gmail.com';  -- 기대: 0
-- ROLLBACK;
--
-- ── 음성 1) 같은 사람이 같은 케이스를 두 번 저장 → 막혀야 한다
-- BEGIN;
--   INSERT INTO public.case_saves (case_study_id, user_email)
--     SELECT id, 'dup@example.com' FROM public.case_studies WHERE review_status='approved' LIMIT 1;
--   INSERT INTO public.case_saves (case_study_id, user_email)
--     SELECT id, 'dup@example.com' FROM public.case_studies WHERE review_status='approved' LIMIT 1;
--   기대: ERROR 23505 duplicate key value violates unique constraint "case_saves_case_study_id_user_email_key"
-- ROLLBACK;
--
-- ── 음성 2) 주인 없는 저장은 못 들어간다
-- BEGIN;
--   INSERT INTO public.case_saves (case_study_id, user_email)
--     SELECT id, NULL FROM public.case_studies LIMIT 1;
--   기대: ERROR 23502 null value in column "user_email"
-- ROLLBACK;
--
-- ── 음성 3) 없는 케이스에는 못 붙는다
-- BEGIN;
--   INSERT INTO public.case_saves (case_study_id, user_email)
--     VALUES ('00000000-0000-0000-0000-000000000000', 'x@example.com');
--   기대: ERROR 23503 foreign key violation
-- ROLLBACK;
--
-- ── 음성 4) anon 키로 PostgREST 직접 호출이 막히는가 (RLS)
--   curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/case_saves?select=id" | head -c 200
--   기대: 빈 배열이 아니라 권한 오류. 행이 돌아오면 정책이 잘못 붙은 것이다.
