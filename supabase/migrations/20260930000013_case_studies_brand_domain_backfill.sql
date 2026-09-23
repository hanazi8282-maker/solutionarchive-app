-- ============================================================
-- 20260930000013_case_studies_brand_domain_backfill
--
-- 케이스 브랜드 40건의 공식 도메인을 `case_studies.brand_domain` 에 채운다.
-- 원본은 `config/brand-domains.json` — 이 파일은 그 JSON 의 status=active 항목만 옮겨 적은 것이고,
-- 사람이 대장을 고치면 이 파일을 다시 만든다(손으로 한쪽만 고치지 마라).
--
-- 왜 필요한가: `lib/cases/logo.ts` 는 `logo_url` 이 없을 때 `brand_domain` 으로 무키 파비콘을
-- 부른다. 값이 없으면 브랜드 이니셜만 나오고, 값이 **틀리면 남의 회사 로고가 그 케이스에 붙는다**.
-- 그래서 짐작으로 채우지 않았다 — 도메인 루트에 HTTPS 1회를 보내 200·리다이렉트를 눈으로 확인한
-- 것만 넣는다(확인 결과는 JSON 의 note 에 브랜드별로 적혀 있다).
--
-- 제외한 13건 — 이 마이그는 손대지 않는다(NULL 로 남아 이니셜이 그려진다):
--   · defunct 11 — Color Labs · Fab.com · Homejoy · Juicero · Meerkat · Munchery · Pets.com ·
--     Quibi · Shyp · The Whole Pantry · Zume.
--     이 중 넷은 도메인이 **다른 회사 것**이라 특히 위험하다:
--       color.com → Color Health(유전체) / fab.com → Epic Games 에셋 마켓 /
--       homejoy.com → Homeaglow 로 301 / juicero.com → 이름만 같은 탄산수 브랜드 /
--       pets.com → 2000년 PetSmart 로 상표·도메인 이전.
--   · rebranded 1 — ConvertKit(convertkit.com → kit.com). 상표 주체는 같지만 로고가 케이스
--     시점과 달라 사람이 보고 결정한다.
--   · unverified 1 — Brandless. 공식 도메인으로 보이나 이번 확인에서 HTTPS 응답을 못 받았다.
--
-- 🟡 백필 — 기존 행의 컬럼 값을 UPDATE 한다. **CLAUDE.md §10.2 사람 판단 예외 2(백필) 해당.**
--    사람 또는 대화형·역할 세션이 적용한다. 서브에이전트가 만든 파일이라 더더욱 자동 적용 금지.
--    다만 파괴적이지 않다: `brand_domain IS NULL` 인 행만 고치므로 사람이 이미 넣어 둔 값을
--    덮어쓰지 않고, 두 번 돌려도 결과가 같다(멱등). 롤백 파일 있음(`_rollback.sql`).
--
-- 적용 절차:
--   1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--   2) 선행 마이그 20260930000001(case_studies.brand_domain 컬럼 추가)이 적용됐는지 확인 —
--      아래 확인 쿼리 (0) 이 0건이면 이 파일을 돌리지 마라(컬럼이 없어 통째로 에러난다).
--   3) 이 파일 실행 → 하단 확인 쿼리를 눈으로 본다.
--   4) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- ⚠️ 슬러그가 DB 와 다르면 그 UPDATE 는 조용히 0건이 된다(에러가 아니다). 그래서 확인 쿼리 (2)가
--    "채워진 건수"를 세고, (3)이 아직 비어 있는 슬러그를 나열한다. 40건이 안 나오면 거기서 멈춰라.
-- ============================================================

-- AG1 (Athletic Greens)
UPDATE public.case_studies SET brand_domain = 'drinkag1.com'
 WHERE slug = 'ag1-single-sku-subscription-greens' AND brand_domain IS NULL;
-- Allbirds
UPDATE public.case_studies SET brand_domain = 'allbirds.com'
 WHERE slug = 'allbirds-awareness-ceiling-collapse' AND brand_domain IS NULL;
-- 조선미녀 (Beauty of Joseon)
UPDATE public.case_studies SET brand_domain = 'beautyofjoseon.com'
 WHERE slug = 'beauty-of-joseon' AND brand_domain IS NULL;
-- Blue Apron
UPDATE public.case_studies SET brand_domain = 'blueapron.com'
 WHERE slug = 'blue-apron-paid-acquisition-treadmill' AND brand_domain IS NULL;
-- Blueland
UPDATE public.case_studies SET brand_domain = 'blueland.com'
 WHERE slug = 'blueland-water-weight-unit-economics' AND brand_domain IS NULL;
-- Carvana
UPDATE public.case_studies SET brand_domain = 'carvana.com'
 WHERE slug = 'carvana-360-imaging-trust' AND brand_domain IS NULL;
-- Casper
UPDATE public.case_studies SET brand_domain = 'casper.com'
 WHERE slug = 'casper-dtc-unit-economics' AND brand_domain IS NULL;
-- Chewy
UPDATE public.case_studies SET brand_domain = 'chewy.com'
 WHERE slug = 'chewy-autoship-retention' AND brand_domain IS NULL;
-- Dollar Shave Club
UPDATE public.case_studies SET brand_domain = 'dollarshaveclub.com'
 WHERE slug = 'dollar-shave-club-viral-launch-awareness' AND brand_domain IS NULL;
-- Dr. Squatch
UPDATE public.case_studies SET brand_domain = 'drsquatch.com'
 WHERE slug = 'dr-squatch-humor-video-natural-soap' AND brand_domain IS NULL;
-- Duolingo
UPDATE public.case_studies SET brand_domain = 'duolingo.com'
 WHERE slug = 'duolingo-streak' AND brand_domain IS NULL;
-- e.l.f. Beauty
UPDATE public.case_studies SET brand_domain = 'elfbeauty.com'
 WHERE slug = 'elf-beauty-awareness-engine' AND brand_domain IS NULL;
-- Figma
UPDATE public.case_studies SET brand_domain = 'figma.com'
 WHERE slug = 'figma-non-designer-distribution' AND brand_domain IS NULL;
-- GoPro
UPDATE public.case_studies SET brand_domain = 'gopro.com'
 WHERE slug = 'gopro-ugc-viral-awareness' AND brand_domain IS NULL;
-- Harry's
UPDATE public.case_studies SET brand_domain = 'harrys.com'
 WHERE slug = 'harrys-razor-factory-vertical-integration' AND brand_domain IS NULL;
-- Hims & Hers
UPDATE public.case_studies SET brand_domain = 'hims.com'
 WHERE slug = 'hims-hair-loss-rx-subscription' AND brand_domain IS NULL;
-- HOKA (Deckers Brands)
UPDATE public.case_studies SET brand_domain = 'hoka.com'
 WHERE slug = 'hoka-specialty-retail-awareness-engine' AND brand_domain IS NULL;
-- hy (한국야쿠르트) 야쿠르트 프로바이오틱스
UPDATE public.case_studies SET brand_domain = 'hy.co.kr'
 WHERE slug = 'hy-yakult-functional-probiotic-certification' AND brand_domain IS NULL;
-- 고려은단 비타민C 1000
UPDATE public.case_studies SET brand_domain = 'koreaeundan.com'
 WHERE slug = 'korea-eundan-vitamin-c-british-ingredient' AND brand_domain IS NULL;
-- 컬리 (마켓컬리)
UPDATE public.case_studies SET brand_domain = 'kurly.com'
 WHERE slug = 'kurly-unit-economics' AND brand_domain IS NULL;
-- 종근당건강 락토핏
UPDATE public.case_studies SET brand_domain = 'ckdhc.com'
 WHERE slug = 'lactofit-mass-price-probiotics' AND brand_domain IS NULL;
-- Liquid Death
UPDATE public.case_studies SET brand_domain = 'liquiddeath.com'
 WHERE slug = 'liquid-death' AND brand_domain IS NULL;
-- Magic Spoon
UPDATE public.case_studies SET brand_domain = 'magicspoon.com'
 WHERE slug = 'magic-spoon-cereal-supply-reorder-discipline' AND brand_domain IS NULL;
-- MoviePass
UPDATE public.case_studies SET brand_domain = 'moviepass.com'
 WHERE slug = 'moviepass-unlimited-pricing-collapse' AND brand_domain IS NULL;
-- Native
UPDATE public.case_studies SET brand_domain = 'nativecos.com'
 WHERE slug = 'native-deodorant-reformulation-reorder' AND brand_domain IS NULL;
-- Notion
UPDATE public.case_studies SET brand_domain = 'notion.com'
 WHERE slug = 'notion-template-gallery' AND brand_domain IS NULL;
-- Nubank (Nu Holdings)
UPDATE public.case_studies SET brand_domain = 'nubank.com.br'
 WHERE slug = 'nubank-word-of-mouth-acquisition' AND brand_domain IS NULL;
-- Oatly
UPDATE public.case_studies SET brand_domain = 'oatly.com'
 WHERE slug = 'oatly-capacity-overbuild' AND brand_domain IS NULL;
-- Peloton
UPDATE public.case_studies SET brand_domain = 'onepeloton.com'
 WHERE slug = 'peloton-owned-manufacturing-exit' AND brand_domain IS NULL;
-- Purple Innovation
UPDATE public.case_studies SET brand_domain = 'purple.com'
 WHERE slug = 'purple-innovation-capacity-scaleup' AND brand_domain IS NULL;
-- Ritual
UPDATE public.case_studies SET brand_domain = 'ritual.com'
 WHERE slug = 'ritual-traceable-ingredients-multivitamin' AND brand_domain IS NULL;
-- Seed Health (DS-01)
UPDATE public.case_studies SET brand_domain = 'seed.com'
 WHERE slug = 'seed-ds01-clinical-strain-probiotic' AND brand_domain IS NULL;
-- Slack
UPDATE public.case_studies SET brand_domain = 'slack.com'
 WHERE slug = 'slack-bottom-up-conversion' AND brand_domain IS NULL;
-- Stanley (PMI Worldwide 소유, Stanley 1913 브랜드)
UPDATE public.case_studies SET brand_domain = 'stanley1913.com'
 WHERE slug = 'stanley-quencher-viral-awareness' AND brand_domain IS NULL;
-- Superhuman
UPDATE public.case_studies SET brand_domain = 'superhuman.com'
 WHERE slug = 'superhuman-pmf-survey-retention-engine' AND brand_domain IS NULL;
-- Tuft & Needle
UPDATE public.case_studies SET brand_domain = 'tuftandneedle.com'
 WHERE slug = 'tuft-and-needle-amazon-review-trust' AND brand_domain IS NULL;
-- Warby Parker
UPDATE public.case_studies SET brand_domain = 'warbyparker.com'
 WHERE slug = 'warby-parker-home-try-on' AND brand_domain IS NULL;
-- YETI Holdings
UPDATE public.case_studies SET brand_domain = 'yeti.com'
 WHERE slug = 'yeti-ambassador-brand-awareness' AND brand_domain IS NULL;
-- Yik Yak
UPDATE public.case_studies SET brand_domain = 'yikyak.com'
 WHERE slug = 'yik-yak-college-only-awareness-cap' AND brand_domain IS NULL;
-- Zapier
UPDATE public.case_studies SET brand_domain = 'zapier.com'
 WHERE slug = 'zapier-integration-page-seo-distribution' AND brand_domain IS NULL;

-- ── 확인 (적용 후 눈으로 본다) ─────────────────────────────
-- (0) 선행 컬럼 존재 — 기대: 1건
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_studies' AND column_name='brand_domain';
--
-- (2) 이 마이그로 채워진 브랜드 수 — 기대: 40건 (이미 사람이 넣어 둔 값이 있었다면 그만큼 적다)
-- SELECT count(*) FROM public.case_studies
--  WHERE brand_domain IS NOT NULL AND slug IN ('ag1-single-sku-subscription-greens', 'allbirds-awareness-ceiling-collapse', 'beauty-of-joseon', 'blue-apron-paid-acquisition-treadmill', 'blueland-water-weight-unit-economics', 'carvana-360-imaging-trust', 'casper-dtc-unit-economics', 'chewy-autoship-retention', 'dollar-shave-club-viral-launch-awareness', 'dr-squatch-humor-video-natural-soap', 'duolingo-streak', 'elf-beauty-awareness-engine', 'figma-non-designer-distribution', 'gopro-ugc-viral-awareness', 'harrys-razor-factory-vertical-integration', 'hims-hair-loss-rx-subscription', 'hoka-specialty-retail-awareness-engine', 'hy-yakult-functional-probiotic-certification', 'korea-eundan-vitamin-c-british-ingredient', 'kurly-unit-economics', 'lactofit-mass-price-probiotics', 'liquid-death', 'magic-spoon-cereal-supply-reorder-discipline', 'moviepass-unlimited-pricing-collapse', 'native-deodorant-reformulation-reorder', 'notion-template-gallery', 'nubank-word-of-mouth-acquisition', 'oatly-capacity-overbuild', 'peloton-owned-manufacturing-exit', 'purple-innovation-capacity-scaleup', 'ritual-traceable-ingredients-multivitamin', 'seed-ds01-clinical-strain-probiotic', 'slack-bottom-up-conversion', 'stanley-quencher-viral-awareness', 'superhuman-pmf-survey-retention-engine', 'tuft-and-needle-amazon-review-trust', 'warby-parker-home-try-on', 'yeti-ambassador-brand-awareness', 'yik-yak-college-only-awareness-cap', 'zapier-integration-page-seo-distribution');
--
-- (3) 여전히 비어 있는 대상 슬러그 — 기대: 0행. 행이 나오면 DB 슬러그가 다르다는 뜻이다.
-- SELECT slug, brand_name FROM public.case_studies
--  WHERE brand_domain IS NULL AND slug IN ('ag1-single-sku-subscription-greens', 'allbirds-awareness-ceiling-collapse', 'beauty-of-joseon', 'blue-apron-paid-acquisition-treadmill', 'blueland-water-weight-unit-economics', 'carvana-360-imaging-trust', 'casper-dtc-unit-economics', 'chewy-autoship-retention', 'dollar-shave-club-viral-launch-awareness', 'dr-squatch-humor-video-natural-soap', 'duolingo-streak', 'elf-beauty-awareness-engine', 'figma-non-designer-distribution', 'gopro-ugc-viral-awareness', 'harrys-razor-factory-vertical-integration', 'hims-hair-loss-rx-subscription', 'hoka-specialty-retail-awareness-engine', 'hy-yakult-functional-probiotic-certification', 'korea-eundan-vitamin-c-british-ingredient', 'kurly-unit-economics', 'lactofit-mass-price-probiotics', 'liquid-death', 'magic-spoon-cereal-supply-reorder-discipline', 'moviepass-unlimited-pricing-collapse', 'native-deodorant-reformulation-reorder', 'notion-template-gallery', 'nubank-word-of-mouth-acquisition', 'oatly-capacity-overbuild', 'peloton-owned-manufacturing-exit', 'purple-innovation-capacity-scaleup', 'ritual-traceable-ingredients-multivitamin', 'seed-ds01-clinical-strain-probiotic', 'slack-bottom-up-conversion', 'stanley-quencher-viral-awareness', 'superhuman-pmf-survey-retention-engine', 'tuft-and-needle-amazon-review-trust', 'warby-parker-home-try-on', 'yeti-ambassador-brand-awareness', 'yik-yak-college-only-awareness-cap', 'zapier-integration-page-seo-distribution');
--
-- (4) 음성 확인 — 폐업·리브랜딩·미확인 13건은 NULL 이어야 한다.
-- SELECT slug, brand_domain FROM public.case_studies
--  WHERE slug IN ('brandless-dtc-pricing-collapse',
--               'color-labs-hype-comprehension-collapse',
--               'convertkit-concierge-migration-conversion',
--               'fab-com-curation-retention-collapse',
--               'homejoy-discount-conversion-collapse',
--               'juicero-viral-trust-collapse',
--               'meerkat-twitter-api-awareness-collapse',
--               'munchery-precook-overproduction-collapse',
--               'pets-com-mass-awareness-negative-margin',
--               'quibi-distribution-channel-collapse',
--               'shyp-flat-fee-unit-economics-collapse',
--               'whole-pantry-unverified-claim-trust-collapse',
--               'zume-pizza-mobile-oven-production-collapse')
--    AND brand_domain IS NOT NULL;   -- 기대: 0행
