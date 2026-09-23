-- ============================================================
-- 20260930000005_transferability_reason
--
-- 채점 카드에서 이식성을 LOW/MEDIUM 으로 고를 때 사람이 적는 **이유 한 줄**을 담는다.
--   case_moves + transferability_reason    (text, ≤200자)
--   case_moves + transferability_reason_at (timestamptz)
--
-- 왜 필요한가: 지금 카드에는 select 만 있고 이유 칸이 없다. "왜 낮다고 봤나"가
-- 사람 머릿속에서 끝나므로, 다음 조사가 같은 종류의 못 옮기는 사례를 또 주워 온다.
-- 이 컬럼이 하루치 다이제스트(`scripts/transferability-feedback-digest.mjs`)를 통해
-- 케이스 조사 프롬프트로 되돌아가는 폐쇄 루프의 입구다.
-- 근거: docs/transferability-feedback-loop.md
--
-- 왜 `_at` 이 따로 있나: `reviewed_at` 은 승인 시각이고, 이유는 나중에 덧붙을 수 있다.
-- 하루 단위 다이제스트가 "어제 적힌 사유"를 고르는 기준이 이 컬럼이다. 승인 시각으로
-- 세면 옛 승인에 오늘 붙인 사유가 영영 집계되지 않는다.
-- `transferability_at`(마이그 20260915000001)과도 다르다 — 그건 판정 시각, 이건 사유 시각이다.
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 2개(둘 다 nullable, 백필 없음, 기존 CHECK 무수정).
--    롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음:
--      삭제 없음 · 기존 데이터 손상 없음(UPDATE·백필 없음) · 인증 경계 안 건드림
--      (RLS ON + 정책 0 = service_role 전용) · 새 수집 소스 아님 · 사업 방향 결정 아님.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가
--    아니다). 사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 이미 있는지 확인 — PostgREST head:true 는 없는 테이블에도
--         204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- 미적용 상태에서 화면은 죽지 않는다: `gradeCase` 가 42703/PGRST204 를 잡아 이 두 필드만
-- 빼고 저장하고, 결과 메시지에 "이유는 저장 안 됨(마이그 20260930000005 미적용)" 을
-- 그대로 띄운다. 승인은 정상 반영된다. 조용히 성공으로 접지 않는다(§7.1).
-- ============================================================

BEGIN;

ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS transferability_reason    text,
  ADD COLUMN IF NOT EXISTS transferability_reason_at timestamptz;

-- 길이 상한은 화면(textarea maxLength=200)과 같은 수를 DB 에도 박는다. 화면만 막으면
-- CLI·직접 UPDATE 로 장문이 들어와 다이제스트가 하루치 요약이 아니라 통째 덤프가 된다.
-- ⚠️ `ADD CONSTRAINT IF NOT EXISTS` 는 Postgres 에 없다. 이름으로 존재를 확인하고 건다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_moves'::regclass
      AND conname = 'case_moves_transferability_reason_len'
  ) THEN
    ALTER TABLE public.case_moves
      ADD CONSTRAINT case_moves_transferability_reason_len
      CHECK (transferability_reason IS NULL OR length(transferability_reason) <= 200);
  END IF;
END $$;

COMMENT ON COLUMN public.case_moves.transferability_reason IS
  '이식성을 LOW/MEDIUM 으로 본 이유 한 줄(사람만 쓴다, 200자 이내). NULL = 미기재이며 "이유 없음"이 아니다(§7.1). 기계가 생성하지 않는다 — §10.1 의 사람 판정 축에 붙은 서술이다.';
COMMENT ON COLUMN public.case_moves.transferability_reason_at IS
  '위 사유가 적힌 시각. 하루 단위 피드백 다이제스트가 "어제 적힌 사유"를 고르는 기준(KST 환산). 승인 시각(reviewed_at)·판정 시각(transferability_at)과 별개다.';

COMMIT;

-- ── 확인 쿼리 (적용 후 눈으로 본다) ─────────────────────────────
--
-- 양성 — 컬럼 2개 + CHECK 1개가 있어야 한다. 기대: 3행.
--   SELECT 'col' AS kind, column_name AS name
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='case_moves'
--      AND column_name IN ('transferability_reason','transferability_reason_at')
--   UNION ALL
--   SELECT 'chk', conname FROM pg_constraint
--    WHERE conrelid='public.case_moves'::regclass
--      AND conname='case_moves_transferability_reason_len';
--
-- 음성 — 201자는 거절돼야 한다. 기대: ERROR 23514. 롤백되므로 데이터가 남지 않는다.
--   BEGIN;
--     UPDATE public.case_moves SET transferability_reason = repeat('가', 201)
--      WHERE id = (SELECT id FROM public.case_moves LIMIT 1);
--   ROLLBACK;
--
-- 음성 2 — 기존 행이 백필되지 않았는지. 기대: 0.
--   SELECT count(*) FROM public.case_moves WHERE transferability_reason IS NOT NULL;
