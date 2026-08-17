-- ============================================================
-- 롤백: 20260816000001_analysis_pipeline.sql
-- 대상: analysis_angles / analysis_aspects / analysis_inputs / analysis_projects
-- 자식 → 부모 역순으로 DROP. CASCADE 사용하지 않는다(외부 객체 동반 삭제 방지).
-- 기존 테이블/함수/트리거/뷰는 건드리지 않는다.
-- ============================================================

DROP TABLE IF EXISTS public.analysis_angles;
DROP TABLE IF EXISTS public.analysis_aspects;
DROP TABLE IF EXISTS public.analysis_inputs;
DROP TABLE IF EXISTS public.analysis_projects;
