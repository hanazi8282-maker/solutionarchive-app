-- 20261115000001_consult_mode_results — v71co P2-A~D: 모드 B(결정 검증)·C1(아이디어 검증)·C2(새 아이디어 추천) 결과 저장. 새 표 1개(add-only).
-- RLS 켬·정책 0 = service_role 전용(앱이 owner_email 로 거른다 — consult_* 와 같은 관례). anon/authenticated 권한 회수.
-- 롤백: 20261115000001_consult_mode_results_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.consult_mode_results (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  mode       text NOT NULL CHECK (mode IN ('b','c1','c2')),
  input      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 사용자가 넣은 값(결정 문장·조건 등). 화면 노출은 owner 본인에게만.
  output     jsonb NOT NULL,                       -- 검증기를 통과한 모드별 결과
  model      text NOT NULL,
  cost_usd   numeric(10,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, mode)
);

ALTER TABLE public.consult_mode_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consult_mode_results FROM anon, authenticated;

COMMIT;

-- 확인(양성): SELECT to_regclass('public.consult_mode_results') IS NOT NULL;  → true
-- 확인(RLS):  SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consult_mode_results'::regclass;  → true
-- 확인(권한): SELECT has_table_privilege('anon','public.consult_mode_results','SELECT');  → false
