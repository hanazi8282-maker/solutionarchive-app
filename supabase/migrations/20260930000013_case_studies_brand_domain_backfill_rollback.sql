-- ============================================================
-- 20260930000013_case_studies_brand_domain_backfill_rollback
--
-- 위 백필을 되돌린다 — 이 마이그가 넣은 40개 슬러그의 `brand_domain` 을 NULL 로 되돌린다.
--
-- ⚠️ 잃는 것: 이 슬러그들에 **사람이 나중에 손으로 넣은 값**도 같이 지워진다. 원래 값이
--    이 파일의 것과 같은지 구분할 방법이 없기 때문이다. 되돌리기 전에 현재 값을 남겨라:
--      SELECT slug, brand_domain FROM public.case_studies
--       WHERE brand_domain IS NOT NULL AND slug IN (...아래 목록...);
--    `logo_url` 은 건드리지 않는다(다른 컬럼이다).
--
-- 컬럼 자체를 지우는 것은 이 파일이 아니라 20260930000001_..._rollback.sql 이다.
-- ============================================================

UPDATE public.case_studies SET brand_domain = NULL
 WHERE slug IN (
   'ag1-single-sku-subscription-greens',
   'allbirds-awareness-ceiling-collapse',
   'beauty-of-joseon',
   'blue-apron-paid-acquisition-treadmill',
   'blueland-water-weight-unit-economics',
   'carvana-360-imaging-trust',
   'casper-dtc-unit-economics',
   'chewy-autoship-retention',
   'dollar-shave-club-viral-launch-awareness',
   'dr-squatch-humor-video-natural-soap',
   'duolingo-streak',
   'elf-beauty-awareness-engine',
   'figma-non-designer-distribution',
   'gopro-ugc-viral-awareness',
   'harrys-razor-factory-vertical-integration',
   'hims-hair-loss-rx-subscription',
   'hoka-specialty-retail-awareness-engine',
   'hy-yakult-functional-probiotic-certification',
   'korea-eundan-vitamin-c-british-ingredient',
   'kurly-unit-economics',
   'lactofit-mass-price-probiotics',
   'liquid-death',
   'magic-spoon-cereal-supply-reorder-discipline',
   'moviepass-unlimited-pricing-collapse',
   'native-deodorant-reformulation-reorder',
   'notion-template-gallery',
   'nubank-word-of-mouth-acquisition',
   'oatly-capacity-overbuild',
   'peloton-owned-manufacturing-exit',
   'purple-innovation-capacity-scaleup',
   'ritual-traceable-ingredients-multivitamin',
   'seed-ds01-clinical-strain-probiotic',
   'slack-bottom-up-conversion',
   'stanley-quencher-viral-awareness',
   'superhuman-pmf-survey-retention-engine',
   'tuft-and-needle-amazon-review-trust',
   'warby-parker-home-try-on',
   'yeti-ambassador-brand-awareness',
   'yik-yak-college-only-awareness-cap',
   'zapier-integration-page-seo-distribution'
 );

-- 확인 — 기대: 0행
-- SELECT slug, brand_domain FROM public.case_studies
--  WHERE brand_domain IS NOT NULL AND slug IN ('ag1-single-sku-subscription-greens', 'allbirds-awareness-ceiling-collapse', 'beauty-of-joseon', 'blue-apron-paid-acquisition-treadmill', 'blueland-water-weight-unit-economics', 'carvana-360-imaging-trust', 'casper-dtc-unit-economics', 'chewy-autoship-retention', 'dollar-shave-club-viral-launch-awareness', 'dr-squatch-humor-video-natural-soap', 'duolingo-streak', 'elf-beauty-awareness-engine', 'figma-non-designer-distribution', 'gopro-ugc-viral-awareness', 'harrys-razor-factory-vertical-integration', 'hims-hair-loss-rx-subscription', 'hoka-specialty-retail-awareness-engine', 'hy-yakult-functional-probiotic-certification', 'korea-eundan-vitamin-c-british-ingredient', 'kurly-unit-economics', 'lactofit-mass-price-probiotics', 'liquid-death', 'magic-spoon-cereal-supply-reorder-discipline', 'moviepass-unlimited-pricing-collapse', 'native-deodorant-reformulation-reorder', 'notion-template-gallery', 'nubank-word-of-mouth-acquisition', 'oatly-capacity-overbuild', 'peloton-owned-manufacturing-exit', 'purple-innovation-capacity-scaleup', 'ritual-traceable-ingredients-multivitamin', 'seed-ds01-clinical-strain-probiotic', 'slack-bottom-up-conversion', 'stanley-quencher-viral-awareness', 'superhuman-pmf-survey-retention-engine', 'tuft-and-needle-amazon-review-trust', 'warby-parker-home-try-on', 'yeti-ambassador-brand-awareness', 'yik-yak-college-only-awareness-cap', 'zapier-integration-page-seo-distribution');
