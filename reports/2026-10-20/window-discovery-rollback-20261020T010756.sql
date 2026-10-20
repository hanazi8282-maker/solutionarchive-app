-- ============================================================
-- 20261020T010756_window_targets_20261020 — ROLLBACK
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
  ('appstore', 'ca:444908810', '2:ca|zoho-crm'),
  ('appstore', 'ca:6450364080', '1:ca|plaud'),
  ('appstore', 'gb:444908810', '2:gb|zoho-crm'),
  ('appstore', 'gb:6450364080', '1:gb|plaud'),
  ('appstore', 'in:444908810', '2:in|zoho-crm'),
  ('appstore', 'gb:1480649572', '1:gb|notta'),
  ('appstore', 'au:444908810', '2:au|zoho-crm'),
  ('appstore', 'gb:563017797', '2:gb|insightly'),
  ('appstore', 'gb:6739429409', '1:gb|granola'),
  ('appstore', 'au:6450364080', '1:au|plaud'),
  ('appstore', 'za:1030906799', '3:za|ripl-social-media-marketing'),
  ('appstore', 'ca:1480649572', '1:ca|notta'),
  ('appstore', 'gb:1021338425', '2:gb|aircall'),
  ('appstore', 'nz:1276437113', '1:nz|otter-ai'),
  ('appstore', 'za:1586861768', '3:za|zeely-ai-marketing-platform'),
  ('appstore', 'za:316800034', '4:za|workday'),
  ('appstore', 'au:563017797', '2:au|insightly'),
  ('appstore', 'sg:698070860', '5:sg|polaris-office-ai'),
  ('appstore', 'au:6740024098', '3:au|pollo-ai-ai-video-image'),
  ('appstore', 'gb:1470197212', '4:gb|personio'),
  ('appstore', 'ca:1231325957', '4:ca|rippling'),
  ('appstore', 'ca:6739429409', '1:ca|granola'),
  ('appstore', 'in:1030906799', '3:in|ripl-social-media-marketing'),
  ('appstore', 'nz:316800034', '4:nz|workday'),
  ('appstore', 'ca:1021338425', '2:ca|aircall'),
  ('appstore', 'nz:964397083', '3:nz|meta-ads-manager'),
  ('appstore', 'za:404249815', '2:za|salesforce'),
  ('appstore', 'ca:598332111', '1:ca|rev'),
  ('appstore', 'gb:6463116243', '5:gb|quillbot'),
  ('appstore', 'us:1511861727', '3:us|triple-whale'),
  ('appstore', 'ca:563017797', '2:ca|insightly'),
  ('appstore', 'au:1480649572', '1:au|notta'),
  ('appstore', 'ie:316800034', '4:ie|workday'),
  ('appstore', 'ca:6478083155', '4:ca|deel'),
  ('appstore', 'ca:879884387', '2:ca|salesrabbit'),
  ('appstore', 'ie:964397083', '3:ie|meta-ads-manager'),
  ('appstore', 'in:1480649572', '1:in|notta'),
  ('appstore', 'sg:1487937127', '5:sg|craft-docs'),
  ('appstore', 'au:6739429409', '1:au|granola'),
  ('appstore', 'us:1470197212', '4:us|personio'),
  ('appstore', 'us:1477264742', '1:us|fellow'),
  ('appstore', 'za:1487937127', '5:za|craft-docs'),
  ('appstore', 'gb:1628773284', '5:gb|wordtune'),
  ('appstore', 'gb:6463164203', '1:gb|fireflies-ai'),
  ('appstore', 'gb:6754837598', '1:gb|bluedot'),
  ('appstore', 'ie:692777054', '2:ie|onepagecrm'),
  ('appstore', 'in:921456160', '2:in|pipedrive');

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
