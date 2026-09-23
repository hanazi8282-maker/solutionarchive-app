-- ============================================================
-- 20260930000001_case_detail_logo_feedback
--
-- 공개 케이스 상세(`/library/<slug>`)가 필요한 자리 2개.
--   1) case_studies + logo_url / brand_domain  — 히어로·카드 썸네일
--   2) 신규 테이블 case_feedback              — 👍/👎 + 한 줄 (T3 사람 신호)
--
-- 근거: reports/2026-09-23/ui-overhaul-reference-plan.md §3(1·8번 블록) ·
--       남헌 2026-09-23 체크포인트 승인(Q4 로고 = 외부 API 기본 + 업로드로 덮어쓰기).
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 2개(둘 다 nullable, 백필 없음) +
--    CREATE TABLE IF NOT EXISTS 1개. 기존 행·컬럼·제약을 건드리지 않는다.
--    롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음:
--      삭제 없음 · 기존 데이터 손상 없음(UPDATE·백필 없음) · 인증 경계 안 건드림
--      (RLS ON + 정책 0 = service_role 전용, 앱은 서버 라우트로만 읽고 쓴다) ·
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
-- 미적용 상태에서 화면은 죽지 않는다: 상세 로더가 컬럼 없음(42703/PGRST204)을
-- "로고 미기재"가 아니라 **컬럼 미적용**으로 구분해 말하고, 피드백 위젯은 저장 실패
-- 사유를 그대로 띄운다. 조용히 성공으로 접지 않는다(§7.1).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) 로고 두 축 — 왜 컬럼이 둘인가
--
--   logo_url     : 사람이 확정한 이미지 주소. 있으면 무조건 이걸 쓴다.
--   brand_domain : 외부 로고 API(파비콘)에 넘길 등록 도메인. `logo_url` 이 비었을 때만 쓴다.
--
-- 하나로 합치지 않는다. 합치면 "사람이 확인한 로고"와 "기계가 도메인으로 추측한 로고"가
-- 같은 칸에 앉아, 틀린 파비콘을 누가 승인했는지 되짚을 수 없다. 둘 다 NULL 은
-- "로고 없음"이고 화면은 브랜드 이니셜 듀오톤을 그린다(lib/cases/logo.ts).
--
-- ⚠️ 백필하지 않는다. brand_name → 도메인 추측은 짐작값이고, 틀린 파비콘은
--    남의 상표를 이 아카이브가 붙여 놓은 것이 된다(reader_axis 의 no_backfill 과 같은 이유).
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS logo_url     text,
  ADD COLUMN IF NOT EXISTS brand_domain text;

COMMENT ON COLUMN public.case_studies.logo_url IS
  '사람이 확정한 로고 이미지 주소. 있으면 외부 로고 API 를 타지 않는다. NULL = 미기재.';
COMMENT ON COLUMN public.case_studies.brand_domain IS
  '외부 로고 API 에 넘길 등록 도메인(www 없이). logo_url 이 비었을 때만 쓴다. 백필하지 않는다 — 추측한 도메인은 남의 상표를 잘못 붙이는 경로다.';


-- ────────────────────────────────────────────────────────────
-- 2) case_feedback — 상세 페이지의 👍/👎 + 한 줄
--
-- 왜 `saved_examples` 가 아닌 새 테이블인가: saved_examples 는 인사이트 루프의 입구고
-- 스키마·소비처가 다르다. 여기 쌓이는 것은 "이 케이스가 내게 쓸모 있었나"라는 T3 사람
-- 신호여서, 리뷰 관련성 채점(review_relevance_verdicts)과 같은 모양으로 따로 둔다.
--
-- 설계에서 갈린 것들:
--   · vote 는 smallint −1/+1 CHECK. boolean 을 쓰지 않는다 — 나중에 0(중립)을 넣을 때
--     boolean 은 컬럼 타입을 바꿔야 하고, 그건 되돌리기 어려운 변경이다.
--   · case_move_id nullable — 케이스 전체에 대한 표가 기본이고, 무브 단위 표는 선택이다.
--   · user_email nullable — 지금 쓰는 경로(서버 액션)는 허용 목록 로그인을 요구하므로
--     항상 채워진다. NULL 자리를 열어 두는 것은 `/library` 접두사가 공개로 열릴 때
--     익명 표를 받기 위한 것이고, 그 결정은 인증 경계 변경이라 사람 몫이다(§10.2).
--     ⚠️ NULL 은 "익명"이지 "확인 실패"가 아니다 — 저장 경로가 실패하면 행을 만들지 않는다.
--   · 중복 방지(같은 사람이 같은 케이스에 두 번) 제약을 **걸지 않는다.**
--     지금 표가 0건이라 무엇이 중복인지 실측이 없다(마음을 바꿔 다시 누른 것도 신호다).
--     ponytail: 필요해지면 `create unique index on case_feedback (case_study_id, user_email)
--     where user_email is not null` 한 줄. 지우는 변경이 아니라 나중에 걸 수 있다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260915000002 참조).
--   브라우저 번들의 anon 키로 PostgREST 를 직접 치는 경로를 막는다. 앱의 읽기·쓰기는
--   전부 서버(service_role)다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id  uuid NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  -- 무브 단위 표(선택). NULL = 케이스 전체에 대한 표다.
  case_move_id   uuid REFERENCES public.case_moves(id) ON DELETE CASCADE,
  vote           smallint NOT NULL CHECK (vote IN (-1, 1)),
  note           text CHECK (note IS NULL OR length(note) <= 500),
  -- 로그인 이메일. NULL = 익명(공개 경로가 열린 뒤에만 생긴다).
  user_email     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_feedback IS
  '케이스 상세의 👍/👎 + 한 줄. T3 사람 신호. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.case_feedback.vote IS
  '-1 또는 +1. boolean 을 쓰지 않는다 — 중립(0)을 넣을 때 타입을 바꾸게 된다.';
COMMENT ON COLUMN public.case_feedback.user_email IS
  'NULL = 익명. "확인 실패"가 아니다 — 저장이 실패하면 행 자체를 만들지 않는다.';

-- 상세 페이지가 "이 케이스 표 N건"을 세는 축.
CREATE INDEX IF NOT EXISTS case_feedback_case_idx
  ON public.case_feedback (case_study_id, created_at DESC);

ALTER TABLE public.case_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_feedback FORCE  ROW LEVEL SECURITY;

COMMIT;


-- ============================================================
-- 확인 쿼리 (적용 직후 실행) — 양성·음성 둘 다 돌린다.
-- "에러 안 났다"로 통과 처리하지 않는다. 막아야 할 것이 막히는지 본다(§7.1).
-- ============================================================
--
-- ── 양성 1) 컬럼 2개가 생겼는가
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_studies'
--    AND column_name IN ('logo_url','brand_domain') ORDER BY column_name;
--   기대: 2행 · text · YES
--
-- ── 양성 2) 백필되지 않았는가 (짐작값이 들어가면 안 된다)
-- SELECT count(*) AS with_logo FROM public.case_studies WHERE logo_url IS NOT NULL OR brand_domain IS NOT NULL;
--   기대: 0
--
-- ── 양성 3) 테이블·RLS·정책
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_feedback' ORDER BY ordinal_position;
--   기대: 7행 (id, case_study_id, case_move_id, vote, note, user_email, created_at)
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='case_feedback';
--   기대: true / true
-- SELECT count(*) FROM pg_policies WHERE tablename='case_feedback';
--   기대: 0 (service_role 전용)
--
-- ── 양성 4) 정상 INSERT (롤백되는 형태로 — 데이터를 남기지 않는다)
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote, note)
--     SELECT id, 1, '옮길 게 있었다' FROM public.case_studies WHERE review_status='approved' LIMIT 1;
--   SELECT vote, user_email, note FROM public.case_feedback;   -- 기대: 1 | NULL | 옮길 게 있었다
-- ROLLBACK;
--
-- ── 음성 1) vote 어휘 밖은 거부돼야 한다
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote)
--     SELECT id, 0 FROM public.case_studies LIMIT 1;
--   기대: ERROR 23514 check constraint "case_feedback_vote_check"
-- ROLLBACK;
--
-- ── 음성 2) 500자 넘는 한 줄은 거부돼야 한다
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote, note)
--     SELECT id, 1, repeat('가', 501) FROM public.case_studies LIMIT 1;
--   기대: ERROR 23514 check constraint "case_feedback_note_check"
-- ROLLBACK;
--
-- ── 음성 3) 없는 케이스에는 못 붙어야 한다
-- BEGIN;
--   INSERT INTO public.case_feedback (case_study_id, vote)
--     VALUES ('00000000-0000-0000-0000-000000000000', 1);
--   기대: ERROR 23503 foreign key violation
-- ROLLBACK;
--
-- ── 음성 4) anon 키로 PostgREST 직접 호출이 막히는가 (RLS)
--   curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/case_feedback?select=id" | head -c 200
--   기대: 빈 배열이 아니라 권한 오류. 행이 돌아오면 정책이 잘못 붙은 것이다.
