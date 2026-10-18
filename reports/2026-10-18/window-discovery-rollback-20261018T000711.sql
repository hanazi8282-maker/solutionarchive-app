-- ============================================================
-- 20261018T000711_window_targets_20261018 — ROLLBACK
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
  ('appstore', 'au:1276437113', '1:au|otter-ai'),
  ('appstore', 'ca:1276437113', '1:ca|otter-ai'),
  ('appstore', 'gb:1030906799', '3:gb|ripl-social-media-marketing'),
  ('appstore', 'gb:1037457231', '3:gb|google-ads'),
  ('appstore', 'gb:1276437113', '1:gb|otter-ai'),
  ('appstore', 'gb:1435480281', '3:gb|boosted-ad-maker-by-lightricks'),
  ('appstore', 'gb:1487937127', '5:gb|craft-docs'),
  ('appstore', 'gb:1586861768', '3:gb|zeely-ai-marketing-platform'),
  ('appstore', 'gb:316800034', '4:gb|workday'),
  ('appstore', 'gb:341249709', '3:gb|hootsuite-owlywriter'),
  ('appstore', 'gb:6471394316', '3:gb|invideo-ai-video-editor'),
  ('appstore', 'gb:6740024098', '3:gb|pollo-ai-ai-video-image'),
  ('appstore', 'gb:698070860', '5:gb|polaris-office-ai'),
  ('appstore', 'gb:822797943', '5:gb|ginger'),
  ('appstore', 'gb:964397083', '3:gb|meta-ads-manager'),
  ('appstore', 'ie:1158877342', '5:ie|grammarly'),
  ('appstore', 'ie:341249709', '3:ie|hootsuite-owlywriter'),
  ('appstore', 'in:1037457231', '3:in|google-ads'),
  ('appstore', 'in:1158877342', '5:in|grammarly'),
  ('appstore', 'in:1232780281', '5:in|notion-ai'),
  ('appstore', 'in:1435480281', '3:in|boosted-ad-maker-by-lightricks'),
  ('appstore', 'in:1487937127', '5:in|craft-docs');

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
