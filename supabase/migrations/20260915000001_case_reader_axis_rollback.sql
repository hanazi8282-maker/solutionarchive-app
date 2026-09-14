-- 20260915000001_case_reader_axis 롤백.
--
-- ⛔⛔ 이 롤백은 **사람이 적은 판정**을 지운다 — 되돌릴 수 없다.
--    case_moves.transferability 는 검수자가 무브를 하나씩 읽고 고른 값이다.
--    기계가 재계산할 수 있는 값이 아니다. 컬럼을 떨어뜨리면 그 판단은 사라지고,
--    복구하려면 사람이 전부 다시 읽어야 한다. transfer_note / preconditions /
--    reader_problem 도 조사원이 원문을 읽고 적은 값이라 재생성 경로가 없다.
--    content_items.source_move 를 지우면 "어느 무브로 글을 썼는지"가 사라져
--    앵글 선택이 다시 형제 무브를 통째로 잃는 상태로 되돌아간다.
--
-- 먼저 백업해라. 아래 세 쿼리 결과를 파일로 남기기 전에는 실행하지 마라:
--   SELECT id, transferability, transferability_by, transferability_at, transfer_note, preconditions
--     FROM public.case_moves
--    WHERE transferability IS NOT NULL OR transfer_note IS NOT NULL OR preconditions IS NOT NULL;
--   SELECT id, slug, reader_problem FROM public.case_studies WHERE reader_problem IS NOT NULL;
--   SELECT code, source_case, source_move FROM public.content_items WHERE source_move IS NOT NULL;

BEGIN;

DROP INDEX IF EXISTS public.case_moves_transferability_grade_idx;

ALTER TABLE public.case_moves
  DROP CONSTRAINT IF EXISTS case_moves_transferability_vocab;

ALTER TABLE public.case_moves
  DROP COLUMN IF EXISTS transfer_note,
  DROP COLUMN IF EXISTS preconditions,
  DROP COLUMN IF EXISTS transferability,
  DROP COLUMN IF EXISTS transferability_by,
  DROP COLUMN IF EXISTS transferability_at;

ALTER TABLE public.case_studies
  DROP CONSTRAINT IF EXISTS case_studies_reader_problem_format;

ALTER TABLE public.case_studies
  DROP COLUMN IF EXISTS reader_problem;

ALTER TABLE public.content_items
  DROP COLUMN IF EXISTS source_move;

COMMIT;
