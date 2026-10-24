-- ============================================================
-- 20261024T005029_window_targets_20261024 — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음: 이 마이그가 넣은 행만 status='failed'(planRevive 대상 아님 — 자동 부활 없음).
--   식별 = (source_key, product_ref, label) 정확히 일치 — LIKE 를 쓰지 않는다. 같은 쌍이 미리 있어 건너뛴 행은
--   라벨이 달라 안 잡힌다(라벨까지 같은 기존 행이 있었다면 적용 전 드라이런에서 걸렀어야 한다).
--   수집된 리뷰(analysis_inputs)는 그대로 남는다. 완전 삭제는 §10.2 예외 1번 — 사람 판단.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _wt_rb (source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _wt_rb (source_key, product_ref, label) VALUES
  ('appstore', 'ie:1276437113', '1:ie|otter-ai'),
  ('appstore', 'ie:1435480281', '3:ie|boosted-ad-maker-by-lightricks'),
  ('appstore', 'ie:1487937127', '5:ie|craft-docs'),
  ('appstore', 'ie:921456160', '2:ie|pipedrive'),
  ('appstore', 'nz:1435480281', '3:nz|boosted-ad-maker-by-lightricks'),
  ('appstore', 'nz:587244049', '4:nz|bamboohr'),
  ('appstore', 'us:1170002741', '4:us|shiftee'),
  ('appstore', 'au:1239908329', '2:au|activecampaign'),
  ('appstore', 'au:1409785530', '4:au|lattice'),
  ('appstore', 'au:1485578688', '2:au|dynamics-365-sales'),
  ('appstore', 'ca:6740884542', '5:ca|sudowrite'),
  ('appstore', 'gb:6740884542', '5:gb|sudowrite'),
  ('appstore', 'gb:692777054', '2:gb|onepagecrm'),
  ('appstore', 'gb:972151811', '07-ecommerce-ops:gb|shipstation'),
  ('appstore', 'in:1231325957', '4:in|rippling'),
  ('appstore', 'in:1297148884', '4:in|hibob'),
  ('appstore', 'in:953610296', '2:in|map-my-customers'),
  ('appstore', 'nz:1487937127', '5:nz|craft-docs'),
  ('appstore', 'sg:1030906799', '3:sg|ripl-social-media-marketing'),
  ('appstore', 'sg:6754837598', '1:sg|bluedot'),
  ('appstore', 'za:1448204455', '3:za|flyer-maker-banner-ads-maker'),
  ('appstore', 'za:910768078', '2:za|linkedin-sales-navigator'),
  ('appstore', 'au:1297148884', '4:au|hibob'),
  ('appstore', 'au:6751626758', '3:au|ai-product-video-ad-pixury'),
  ('appstore', 'ca:1094699978', '2:ca|zoho-salesiq'),
  ('appstore', 'ca:1421097870', '2:ca|keap'),
  ('appstore', 'ca:337938121', '2:ca|nutshell'),
  ('appstore', 'ca:651636273', '2:ca|nimble'),
  ('appstore', 'gb:1020253220', '4:gb|15five'),
  ('appstore', 'gb:1073125057', '2:gb|freshsales'),
  ('appstore', 'gb:1094699978', '2:gb|zoho-salesiq'),
  ('appstore', 'gb:1409785530', '4:gb|lattice'),
  ('appstore', 'gb:1477264742', '1:gb|fellow'),
  ('appstore', 'gb:6751626758', '3:gb|ai-product-video-ad-pixury'),
  ('appstore', 'ie:1470197212', '4:ie|personio'),
  ('appstore', 'ie:444908810', '2:ie|zoho-crm'),
  ('appstore', 'in:1073125057', '2:in|freshsales'),
  ('appstore', 'in:6751626758', '3:in|ai-product-video-ad-pixury'),
  ('appstore', 'nz:563017797', '2:nz|insightly'),
  ('appstore', 'sg:1454212098', '2:sg|bigin'),
  ('appstore', 'sg:444908810', '2:sg|zoho-crm'),
  ('appstore', 'us:1541170153', '1:us|avoma'),
  ('appstore', 'us:6753818538', '1:us|tldv'),
  ('appstore', 'za:6739429409', '1:za|granola'),
  ('appstore', 'za:6751626758', '3:za|ai-product-video-ad-pixury');

DO $$
DECLARE running_at text;
BEGIN
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _wt_rb) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM _wt_rb r
 WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref AND t.label = r.label AND t.status <> 'failed';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.review_targets t JOIN _wt_rb r USING (source_key, product_ref, label) WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '%행이 아직 failed 가 아니다', still; END IF;
END $$;

COMMIT;
