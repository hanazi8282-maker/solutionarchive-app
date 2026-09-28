-- 케이스 숨김(soft delete) — case_studies 에 숨김 표시 3컬럼.
--
-- 근거: 남헌 2026-09-28 지시 — 자동 승인(feat/case-auto-approval) 가동 전에, 잘못 내보낸 케이스를 사람이 즉시 내릴 수 있어야 한다.
--   "반려"(review_status)는 검수 결정이고 이건 "공개에서 내림"이다. 둘을 섞지 않으려고 별도 컬럼으로 둔다.
--   코드: lib/cases/deleted.ts · app/cases/actions.ts(deleteCase/restoreCase) · app/cases/delete-form.tsx.
--
-- 번호: 작성 시점 최대가 000027 이고 다른 에이전트 2곳이 동시에 마이그를 추가 중이라 000030 으로 3칸 띄웠다.
--
-- 🟢 비파괴. nullable 컬럼 3개 ADD COLUMN IF NOT EXISTS + 부분 인덱스 1개. 기존 행·제약 변경 없음, 백필 없음.
--    무브는 따로 컬럼을 두지 않는다 — 부모 케이스를 따라 숨는다(코드가 case_study_id 로 거른다).
--    하드 DELETE 경로는 만들지 않았다 — 자식 5개 테이블이 ON DELETE CASCADE 라 되돌릴 수 없다(§10.2 예외 1).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관(허용목록 그대로) ·
--    새 소스 아님 · 사업 방향 아님.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(§10.2). 미적용이어도 앱은 죽지 않는다: 숨김 조회가 42703 을
--   "숨긴 것 없음"으로 읽고(컬럼이 없으면 숨길 수 없었다), 숨김 버튼만 "마이그 미적용"을 돌려준다.
--   절차: 1) solutionarchive qmgrfqjfxqhxuufrnkwf 확인 2) information_schema 로 컬럼 부재 확인 3) 실행 → 하단 확인 쿼리
--         4) docs/migration-exceptions.md 한 줄.

ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

COMMENT ON COLUMN public.case_studies.deleted_at IS '숨김 시각. NOT NULL 이면 공개·검색·어드바이저·퀴즈·앵글 선택 어디에도 안 나간다. 복원 = NULL. review_status 와 별개 축.';
COMMENT ON COLUMN public.case_studies.deleted_by IS '숨긴 사람(로그인 이메일). 복원해도 남긴다 — 마지막 숨김 기록.';
COMMENT ON COLUMN public.case_studies.delete_reason IS '숨김 사유(필수, 500자 이내 — 앱 검증). 복원해도 남긴다.';

CREATE INDEX IF NOT EXISTS idx_case_studies_deleted_at
  ON public.case_studies (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 확인 쿼리(적용 후)
--   양성: SELECT column_name FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='case_studies' AND column_name IN ('deleted_at','deleted_by','delete_reason');  -- 3행
--   음성(롤백되는 형태): BEGIN; UPDATE public.case_studies SET deleted_at = now() WHERE id = (SELECT id FROM public.case_studies LIMIT 1);
--         SELECT count(*) FROM public.case_studies WHERE deleted_at IS NOT NULL;  -- 1
--         ROLLBACK;
