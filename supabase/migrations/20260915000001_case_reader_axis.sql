-- ============================================================
-- 20260915000001_case_reader_axis
--
-- 케이스 조사의 1순위 축을 "브랜드 사례"에서 **독자 이식성**으로 옮긴다.
--   case_studies + reader_problem                      (선정 1순위 축)
--   case_moves   + transfer_note / preconditions       (조사원이 채우는 관측)
--   case_moves   + transferability / _by / _at         (사람이 고르는 판정)
--   content_items + source_move                        (형제 무브 유실 차단)
--
-- ⚠️ 미적용. 사람이 적용한다 (CLAUDE.md §10.1):
--     supabase db query --linked -f supabase/migrations/20260915000001_case_reader_axis.sql
--   대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (dothegy-os 아님)
--   선행: 20260906000001_case_study_pipeline.sql
--
-- 왜 필요한가
--   (1) content_items 에는 `code` 와 `source_case` 뿐이라(실측 2026-09-14) 어느
--       **무브**로 글을 썼는지 기록이 없다. 그래서 앵글 선택이 슬러그 단위로
--       제외되고, 승인 무브 30건이 케이스 15개에 정확히 2개씩 붙어 있는 현재
--       분포에서는 **형제 무브 약 15건이 통째로 유실**된다. source_move 하나로
--       그 15건이 즉시 후보로 되살아난다.
--   (2) 독자는 "만들 줄은 아는데 돈으로 바꾸는 법을 모르는 사람"이다. 그 사람이
--       자기 상황에 옮겨 쓸 수 있는가(transferability)가 등급보다 앞선 축인데,
--       지금은 그 축을 적을 자리 자체가 없다.
--
-- 설계 원칙 (컬럼 배치가 곧 권한 경계다)
--   · 관측(transfer_note / preconditions)은 조사원이 채운다 — 기계가 써도 되는 값.
--   · 판정(transferability)은 **사람만** 쓴다. 무인 루프는 읽기만 한다.
--     새 승인 경로를 만들지 않았다 — 기존 /cases 승인 트랜잭션과 CLI(--by 필수)
--     둘뿐이다 (CLAUDE.md §10.1).
--   · NULL 은 "LOW" 가 아니라 **"아직 사람이 안 봤다"** 다. 앵글 정렬은
--     HIGH > MEDIUM > NULL > LOW 로 NULL 을 LOW 위에 둔다 (§7.1).
--
-- 비파괴: ADD COLUMN IF NOT EXISTS 만. 전부 nullable, 기존 행은 전부 NULL.
--   **백필하지 않는다.** bottleneck → reader_problem 자동 매핑은 짐작값이
--   다음 조사 수요를 결정하는 오염 경로다. 매핑 제안표는
--   docs/case-study-pipeline-design.md 에 문서로만 둔다.
--
-- reader_problem CHECK 은 **형식만** 본다(^[A-Z][A-Z_]*$).
--   어휘 정본은 config/reader-problems.json 이다. 어휘를 CHECK 에 박으면
--   레퍼런스가 올 때마다 마이그레이션을 새로 써야 하고, 그동안 조사원은
--   기존 어휘에 억지로 끼워 맞춘다. 어휘 드리프트는
--   scripts/case-pipeline-verify.mjs 가 DB distinct 값과 파일을 대조해 막는다.
-- ============================================================

BEGIN;

ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS reader_problem text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_studies_reader_problem_format'
  ) THEN
    ALTER TABLE public.case_studies
      ADD CONSTRAINT case_studies_reader_problem_format
      CHECK (reader_problem IS NULL OR reader_problem ~ '^[A-Z][A-Z_]*$');
  END IF;
END $$;

ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS transfer_note text,
  ADD COLUMN IF NOT EXISTS preconditions text,
  ADD COLUMN IF NOT EXISTS transferability text,
  ADD COLUMN IF NOT EXISTS transferability_by text,
  ADD COLUMN IF NOT EXISTS transferability_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_transferability_vocab'
  ) THEN
    ALTER TABLE public.case_moves
      ADD CONSTRAINT case_moves_transferability_vocab
      CHECK (transferability IS NULL OR transferability IN ('HIGH', 'MEDIUM', 'LOW'));
  END IF;
END $$;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS source_move text;

-- 앵글 선택이 매 실행 도는 경로. 승인 무브만 본다.
CREATE INDEX IF NOT EXISTS case_moves_transferability_grade_idx
  ON public.case_moves (transferability, evidence_grade)
  WHERE review_status = 'approved';

COMMENT ON COLUMN public.case_studies.reader_problem IS
  '이 케이스를 옮겨 쓸 독자가 지금 막혀 있는 지점. 선정 1순위 축. 어휘 정본은 config/reader-problems.json (CHECK 은 형식만). NULL = 미기재, 자동 매핑 금지.';
COMMENT ON COLUMN public.case_moves.transfer_note IS
  '독자가 **내일** 할 수 있는 최소 행동 1개. 조사원이 채우는 관측값.';
COMMENT ON COLUMN public.case_moves.preconditions IS
  '이 무브를 옮기려면 독자에게 뭐가 있어야 하나. NULL = 미기재이지 "전제 없음"이 아니다(§7.1).';
COMMENT ON COLUMN public.case_moves.transferability IS
  'HIGH/MEDIUM/LOW. **사람만 쓴다** — 승인할 때 /cases 서버 액션 또는 case-review.mjs transferability --by 로만 들어온다. NULL = 미판정이며 LOW 가 아니다. 앵글 정렬은 HIGH>MEDIUM>NULL>LOW.';
COMMENT ON COLUMN public.case_moves.transferability_by IS
  '이식성을 고른 사람. 값이 있는데 여기가 비어 있으면 기계가 썼다는 뜻이다 — 그런 경로는 없어야 한다.';
COMMENT ON COLUMN public.content_items.source_move IS
  '이 소재가 딛고 선 case_moves.id. NULL = 기록 이전 행이며, 그때는 앵글 선택이 종전대로 슬러그 단위로 제외한다("어느 무브였는지 모른다"를 "다른 무브였다"로 접지 않는다).';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 확인 쿼리 (적용 후) — 양성·음성 둘 다 본다(§7.1)
-- ────────────────────────────────────────────────────────────
--
-- 양성: 컬럼 7개 존재 (기대 7행)
--   SELECT table_name, column_name, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'case_studies'  AND column_name = 'reader_problem')
--        OR (table_name = 'case_moves'    AND column_name IN ('transfer_note','preconditions','transferability','transferability_by','transferability_at'))
--        OR (table_name = 'content_items' AND column_name = 'source_move'));
--
-- 양성: 인덱스 존재 (기대 1행)
--   SELECT indexname FROM pg_indexes WHERE tablename = 'case_moves' AND indexname = 'case_moves_transferability_grade_idx';
--
-- 백필 안 함 확인: 전부 NULL 이어야 한다 (기대: 두 쿼리 모두 0)
--   SELECT count(*) FROM public.case_studies WHERE reader_problem IS NOT NULL;
--   SELECT count(*) FROM public.case_moves   WHERE transferability IS NOT NULL;
--
-- 기존 데이터 무변경: 적용 전후 같은 값이어야 한다
--   SELECT review_status, count(*) FROM public.case_moves   GROUP BY 1 ORDER BY 1;  -- 기대 draft 32 / approved 30
--   SELECT review_status, count(*) FROM public.case_studies GROUP BY 1 ORDER BY 1;  -- 기대 draft 15 / approved 15
--
-- 음성: 어휘 밖 값은 거절 (ERROR 23514 기대, 롤백되므로 데이터 영향 없음)
--   BEGIN; UPDATE public.case_moves SET transferability = 'MAYBE' WHERE id = (SELECT id FROM public.case_moves LIMIT 1); ROLLBACK;
--   BEGIN; UPDATE public.case_studies SET reader_problem = 'make but no money' WHERE id = (SELECT id FROM public.case_studies LIMIT 1); ROLLBACK;
--
-- 음성: 어휘 드리프트 검사가 실제로 막는지
--   node --env-file=.env.local scripts/case-pipeline-verify.mjs   -- reader_problem 이 파일 밖이면 exit 2
