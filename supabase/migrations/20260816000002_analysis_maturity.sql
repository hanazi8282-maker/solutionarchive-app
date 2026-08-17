-- ============================================================
-- analysis_projects 에 Stage2(시장 성숙도 진단) 컬럼 3종 추가
-- 순수 추가(ADD COLUMN)만 존재. 기존 컬럼/데이터 변경 0건.
-- maturity_stage  : 1~5 성숙도 단계 (1=시장창출 … 5=정체성·재창출)
-- maturity_notes  : 판단 근거 한 줄
-- m_meta_signal   : 카테고리 전체를 비교하는 소비자 발화 존재 여부
-- 가역: 동명 rollback 파일 참조(20260816000002_analysis_maturity_rollback.sql).
-- ============================================================

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS maturity_stage int CHECK (maturity_stage BETWEEN 1 AND 5);

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS maturity_notes text;

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS m_meta_signal boolean DEFAULT false;

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON COLUMN public.analysis_projects.maturity_stage IS 'Stage2 시장 성숙도 1~5 (1=시장창출, 2=주장확장, 3=고유 메커니즘 등장, 4=메커니즘 정제, 5=정체성·재창출)';
COMMENT ON COLUMN public.analysis_projects.maturity_notes IS 'Stage2 성숙도 판단 근거 한 줄';
COMMENT ON COLUMN public.analysis_projects.m_meta_signal IS '"요즘은 다 비슷하다" 류 카테고리 전체 비교 발화 존재 여부';
