-- ============================================================
-- 20260820000001_analysis_aspect_llm_baseline.sql 되돌리기
--
-- ⚠️ 이 롤백은 수집된 라벨 데이터를 영구 삭제한다.
--   llm_* 는 재생성할 수 없다 — 원본을 남긴 그 추출 시점이 지나갔기 때문이다.
--   되돌리기 전에 반드시 백업하라:
--     CREATE TABLE _backup_llm_baseline_20260820 AS
--     SELECT id, project_id, llm_importance, llm_satisfaction, llm_attribution,
--            llm_aspect_layer, llm_pain_timing, llm_persona_role,
--            llm_proxy_consumption, llm_is_segmentation_axis, reviewed_at
--     FROM public.analysis_aspects;
--
-- 코드보다 먼저 되돌리면 추출 INSERT 가 42703 으로 실패한다.
-- 코드를 먼저 배포로 되돌린 뒤 이 스크립트를 실행할 것.
-- ============================================================

ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_importance;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_satisfaction;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_attribution;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_aspect_layer;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_pain_timing;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_persona_role;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_proxy_consumption;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS llm_is_segmentation_axis;
ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS reviewed_at;
