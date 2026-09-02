-- App Store 소스 등록 롤백.
--
-- ⚠️ A) 되돌릴 수 없는 지점 확인이 먼저다.
--    이 소스로 이미 수집한 것이 있으면 아래 DELETE 는 FK 때문에 실패한다.
--    그게 안전장치다 — 수집한 데이터를 남긴 채 소스만 지우면
--    analysis_inputs.source_key 가 가리킬 곳이 없어진다.
--
--    select
--      (select count(*) from public.review_targets where source_key='appstore') as targets,
--      (select count(*) from public.analysis_inputs where source_key='appstore') as inputs,
--      (select count(*) from public.review_fingerprints where source_key='appstore') as fingerprints;
--
--    셋 다 0 이 아니면 여기서 멈추고 사람이 판단한다.

-- B) 소스를 지우는 대신 끄는 것이 대개 맞다. 수집 이력이 남는다.
-- UPDATE public.review_sources
--   SET enabled = false, disabled_reason = '롤백', disabled_at = now()
--   WHERE key = 'appstore';

-- C) 정말로 지울 때만.
DELETE FROM public.review_sources WHERE key = 'appstore';
