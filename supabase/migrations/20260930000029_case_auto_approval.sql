-- 케이스 무브 자동 승인 ca-v1 — 표시·승인 컬럼(연결 설계 §5-2 그대로).
--
-- 근거: CLAUDE.md §10.1 예외 2 · reports/2026-09-28/case-approval-linkage-design.md §4·§5-2 ·
--       docs/case-approval-automation-roadmap.md. 코드: lib/cases/case-auto-approval.ts · scripts/case-auto-approve.mjs.
--
-- 번호: 000028 은 병행 브랜치 feat/researcher-voc-input 의 case_move_inputs 몫으로 비워 둔다(충돌 회피로 +2).
--   이 파일은 case_move_inputs 를 만들지 않는다 — 없으면 배치가 '확인 불가'로 닫힌다.
--
-- 🟢 비파괴. nullable 컬럼 5개 ADD COLUMN IF NOT EXISTS + 부분 인덱스 1개. 기존 CHECK(review_status)·행·백필 없음.
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--    (단 3단계 **가동**은 로드맵 §5 대로 사람 판단이다 — 이 파일은 자리만 만든다.)
--
-- 노출('검증중')은 새 컬럼을 두지 않는다: auto_approval_rule IS NOT NULL ∧ reviewed_by IS NULL 이 곧 "기계가 승인했고
--   사람이 아직 안 봤다" 이고(되돌리기 판별자와 같은 식), 사람이 불시검수에서 맞다고 결정하면 reviewed_by 가 채워져
--   정식 노출로 올라간다. 사람 승인 케이스는 auto_approval_rule 이 NULL 이라 영향이 없다(lib/cases/case-auto-approval.ts caseExposure).
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용해도 아무것도 켜지지 않는다 —
--   리포 변수 CASE_AUTO_APPROVAL_STAGE(기본 off)가 따로 필요하다.

ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS auto_candidate_at  timestamptz,   -- 2단계: 후보 표시 시각(표시만, 상태 아님)
  ADD COLUMN IF NOT EXISTS auto_approved_at   timestamptz,   -- 3단계: 기계가 approved 로 바꾼 시각
  ADD COLUMN IF NOT EXISTS auto_approval_rule text;          -- 'ca-v1' · 되돌리면 'ca-v1:reverted'
ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS auto_approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_rule text;

CREATE INDEX IF NOT EXISTS case_moves_auto_approved_idx
  ON public.case_moves (auto_approved_at DESC) WHERE auto_approved_at IS NOT NULL;

COMMENT ON COLUMN public.case_moves.auto_approved_at IS
  'ca-v1 자동 승인 시각. reviewed_by IS NULL 이면 사람이 안 본 승인 — 킬스위치 되돌리기 대상이고 공개 목록에서 검증중.';
COMMENT ON COLUMN public.case_moves.auto_approval_rule IS
  '자동 승인 조건 태그(ca-v1). 되돌린 행은 ca-v1:reverted. NULL = 사람 경로.';
COMMENT ON COLUMN public.case_studies.auto_approval_rule IS
  '자동 승인 조건 태그(ca-v1). NOT NULL ∧ reviewed_by NULL = 검증중(불시검수 전, 목록 아래·배지).';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select table_name, column_name, is_nullable from information_schema.columns
--    where table_schema='public' and column_name in ('auto_candidate_at','auto_approved_at','auto_approval_rule')
--      and table_name in ('case_moves','case_studies');                                   -- 5행, 전부 YES
--   select count(*) from public.case_moves where auto_approval_rule is not null;           -- 0 (단계 off)
-- ── 음성 (롤백되는 형태) ──
--   begin;
--     update public.case_moves set auto_approved_at = 'not-a-time' where false;          -- 기대: ERROR 22007
--   rollback;
