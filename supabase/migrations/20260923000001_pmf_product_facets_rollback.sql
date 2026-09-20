-- 20260923000001_pmf_product_facets.sql 되돌리기
--
-- ⚠️ 컬럼 DROP 은 그 컬럼에 사람이 넣은 패싯·인용을 지운다. analysis_projects / analysis_aspects 행 자체는 남는다.
--    seller_profiles 는 통째로 사라진다.

ALTER TABLE public.analysis_projects
  DROP COLUMN IF EXISTS market,
  DROP COLUMN IF EXISTS bottleneck,
  DROP COLUMN IF EXISTS business_model,
  DROP COLUMN IF EXISTS buyer_type,
  DROP COLUMN IF EXISTS price_band,
  DROP COLUMN IF EXISTS purchase_frequency;

ALTER TABLE public.analysis_aspects DROP COLUMN IF EXISTS evidence_quotes;

DROP TABLE IF EXISTS public.seller_profiles;
