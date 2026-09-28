-- 롤백: 20260930000031_relevance_product_informative.sql
-- 정보 판정 3개만 사라진다. verdict·second_verdict·human_verdict·라벨·자동 승인 표시는 그대로다.
ALTER TABLE public.review_relevance_verdicts
  DROP COLUMN IF EXISTS human_product_informative,
  DROP COLUMN IF EXISTS second_product_informative,
  DROP COLUMN IF EXISTS product_informative;
