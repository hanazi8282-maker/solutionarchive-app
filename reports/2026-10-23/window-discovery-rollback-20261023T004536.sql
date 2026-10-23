-- ============================================================
-- 20261023T004536_window_targets_20261023 — ROLLBACK
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
  ('appstore', 'in:1094699978', '2:in|zoho-salesiq'),
  ('appstore', 'sg:910768078', '2:sg|linkedin-sales-navigator'),
  ('appstore', 'au:6463116243', '5:au|quillbot'),
  ('appstore', 'au:6754837598', '1:au|bluedot'),
  ('appstore', 'ca:1459654107', '2:ca|covve'),
  ('appstore', 'ca:953610296', '2:ca|map-my-customers'),
  ('appstore', 'gb:1448204455', '3:gb|flyer-maker-banner-ads-maker'),
  ('appstore', 'gb:337938121', '2:gb|nutshell'),
  ('appstore', 'gb:941438829', '2:gb|copper'),
  ('appstore', 'in:6740024098', '3:in|pollo-ai-ai-video-image'),
  ('appstore', 'nz:698070860', '5:nz|polaris-office-ai'),
  ('appstore', 'za:6450364080', '1:za|plaud'),
  ('appstore', 'au:587244049', '4:au|bamboohr'),
  ('appstore', 'au:6463164203', '1:au|fireflies-ai'),
  ('appstore', 'au:941438829', '2:au|copper'),
  ('appstore', 'ca:6448556170', '5:ca|wrtn'),
  ('appstore', 'ca:6754837598', '1:ca|bluedot'),
  ('appstore', 'ca:941438829', '2:ca|copper'),
  ('appstore', 'gb:1239908329', '2:gb|activecampaign'),
  ('appstore', 'gb:651636273', '2:gb|nimble'),
  ('appstore', 'ie:822797943', '5:ie|ginger'),
  ('appstore', 'in:6739429409', '1:in|granola'),
  ('appstore', 'nz:1586861768', '3:nz|zeely-ai-marketing-platform'),
  ('appstore', 'sg:561683423', '2:sg|bitrix24'),
  ('appstore', 'us:1632867925', '1:us|daglo'),
  ('appstore', 'za:444908810', '2:za|zoho-crm'),
  ('appstore', 'za:561683423', '2:za|bitrix24'),
  ('appstore', 'za:6463116243', '5:za|quillbot'),
  ('appstore', 'za:6463164203', '1:za|fireflies-ai'),
  ('appstore', 'au:1421097870', '2:au|keap'),
  ('appstore', 'ca:1114709439', '2:ca|salesmate'),
  ('appstore', 'ca:1239908329', '2:ca|activecampaign'),
  ('appstore', 'ca:1409785530', '4:ca|lattice'),
  ('appstore', 'ca:1448204455', '3:ca|flyer-maker-banner-ads-maker'),
  ('appstore', 'gb:1231325957', '4:gb|rippling'),
  ('appstore', 'gb:1421097870', '2:gb|keap'),
  ('appstore', 'gb:6747801435', '1:gb|jamie');

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
