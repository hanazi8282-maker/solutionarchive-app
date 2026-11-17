-- v71cr §2·§3: 꼬리표 재라벨은 "추가 전용"(기존 행 덮어쓰기·삭제 금지)인데 case_bank_labels 는 UNIQUE(case_id)라
-- 새 label_run 행을 같은 표에 못 넣는다. 그래서 개정 행 전용 새 표를 둔다(기존 표는 손대지 않음).
-- 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거). 컬럼·CHECK 는 case_bank_labels 와 동일(LIKE).
BEGIN;
CREATE TABLE IF NOT EXISTS public.case_bank_label_revisions (
  LIKE public.case_bank_labels INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE public.case_bank_label_revisions ADD PRIMARY KEY (id);
ALTER TABLE public.case_bank_label_revisions ADD CONSTRAINT case_bank_label_revisions_case_run_key UNIQUE (case_id, label_run);
CREATE INDEX IF NOT EXISTS case_bank_label_revisions_case_idx ON public.case_bank_label_revisions (case_id);
CREATE INDEX IF NOT EXISTS case_bank_label_revisions_run_idx ON public.case_bank_label_revisions (label_run);
ALTER TABLE public.case_bank_label_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_bank_label_revisions FROM anon, authenticated;
COMMIT;
-- 확인(양성): to_regclass('public.case_bank_label_revisions') 존재 · relrowsecurity=true · UNIQUE(case_id,label_run) 존재
-- 확인(음성): has_table_privilege('anon','public.case_bank_label_revisions','SELECT') = false
-- (읽는 쪽 합치기용 뷰는 이 마이그에 넣지 않는다 — 조회 코드 전환은 별도 PR)
