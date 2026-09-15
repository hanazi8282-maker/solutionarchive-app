-- case_moves.fact_check_grade — evidence_grade 재설계(2026-09-16, 남헌 지시)로 분리된
-- "사실확인" 축. evidence_grade 는 이제 독자 인사이트 등급이고(lib/cases/draft.ts
-- gradeMove 재설계), 예전 산식(공시>비자기보고 1차>교차확인 2곳 이상>자기보고 순)은
-- factCheckGrade() 로 이름만 바뀌어 이 컬럼에 쓰인다. CG-1/CG-2 발행 게이트
-- (lib/cases/publish-gate.ts)는 이 컬럼을 본다 — evidence_grade 를 보면 "근거 0건인데
-- transfer_note 만 그럴듯해도 A"가 CG 를 우회한다.
--
-- 백필: 기존 evidence_grade 값은 옛 산식(=factCheckGrade 그 자체) 결과이므로 그대로
-- 복사한다 — 재계산이 아니라 이름 이동이다. evidence_grade 자체는 이후 사람이
-- `scripts/case-review.mjs regrade` 로 새 산식에 맞춰 다시 계산한다(이 마이그레이션은
-- evidence_grade 값을 바꾸지 않는다).
--
-- 남헌 명시 승인(2026-09-16) 하 Claude Code 가 직접 적용 — CLAUDE.md §10.1 예외.

ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS fact_check_grade text;

UPDATE public.case_moves
  SET fact_check_grade = evidence_grade
  WHERE fact_check_grade IS NULL;

ALTER TABLE public.case_moves
  ALTER COLUMN fact_check_grade SET NOT NULL;

ALTER TABLE public.case_moves
  ADD CONSTRAINT case_moves_fact_check_grade_check
  CHECK (fact_check_grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]));

COMMENT ON COLUMN public.case_moves.fact_check_grade IS
  '사실확인 등급(옛 evidence_grade 산식). CG-1/CG-2 발행 게이트 전용. evidence_grade 는 2026-09-16부터 독자 인사이트 등급.';
COMMENT ON COLUMN public.case_moves.evidence_grade IS
  '독자 인사이트 등급(2026-09-16 재설계) — transfer_note·preconditions 기반. 사실확인은 fact_check_grade.';
