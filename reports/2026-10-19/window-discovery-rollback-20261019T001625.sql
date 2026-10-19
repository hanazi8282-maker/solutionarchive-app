-- ============================================================
-- 20261019T001625_window_targets_20261019 — ROLLBACK
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
  ('appstore', 'au:404249815', '2:au|salesforce'),
  ('appstore', 'au:921456160', '2:au|pipedrive'),
  ('appstore', 'ca:404249815', '2:ca|salesforce'),
  ('appstore', 'ca:921456160', '2:ca|pipedrive'),
  ('appstore', 'gb:404249815', '2:gb|salesforce'),
  ('appstore', 'gb:910768078', '2:gb|linkedin-sales-navigator'),
  ('appstore', 'gb:921456160', '2:gb|pipedrive'),
  ('appstore', 'in:316800034', '4:in|workday'),
  ('appstore', 'in:341249709', '3:in|hootsuite-owlywriter'),
  ('appstore', 'in:404249815', '2:in|salesforce'),
  ('appstore', 'in:6471394316', '3:in|invideo-ai-video-editor'),
  ('appstore', 'in:698070860', '5:in|polaris-office-ai'),
  ('appstore', 'in:822797943', '5:in|ginger'),
  ('appstore', 'in:964397083', '3:in|meta-ads-manager'),
  ('appstore', 'nz:1158877342', '5:nz|grammarly'),
  ('appstore', 'nz:341249709', '3:nz|hootsuite-owlywriter'),
  ('appstore', 'sg:1158877342', '5:sg|grammarly'),
  ('appstore', 'sg:1232780281', '5:sg|notion-ai'),
  ('appstore', 'sg:316800034', '4:sg|workday'),
  ('appstore', 'sg:341249709', '3:sg|hootsuite-owlywriter'),
  ('appstore', 'sg:6471394316', '3:sg|invideo-ai-video-editor'),
  ('appstore', 'us:1276437113', '1:us|otter-ai'),
  ('appstore', 'us:316800034', '4:us|workday'),
  ('appstore', 'us:341249709', '3:us|hootsuite-owlywriter'),
  ('appstore', 'us:698070860', '5:us|polaris-office-ai'),
  ('appstore', 'za:1158877342', '5:za|grammarly'),
  ('appstore', 'za:1232780281', '5:za|notion-ai'),
  ('appstore', 'za:341249709', '3:za|hootsuite-owlywriter'),
  ('appstore', 'za:6471394316', '3:za|invideo-ai-video-editor'),
  ('appstore', 'za:897446215', '3:za|canva'),
  ('appstore', 'za:964397083', '3:za|meta-ads-manager'),
  ('appstore', 'au:910768078', '2:au|linkedin-sales-navigator'),
  ('appstore', 'gb:598332111', '1:gb|rev'),
  ('appstore', 'ie:6471394316', '3:ie|invideo-ai-video-editor'),
  ('appstore', 'ca:910768078', '2:ca|linkedin-sales-navigator'),
  ('appstore', 'ca:6740024098', '3:ca|pollo-ai-ai-video-image'),
  ('appstore', 'in:6463116243', '5:in|quillbot'),
  ('appstore', 'au:1435480281', '3:au|boosted-ad-maker-by-lightricks'),
  ('appstore', 'in:910768078', '2:in|linkedin-sales-navigator'),
  ('appstore', 'za:1276437113', '1:za|otter-ai'),
  ('appstore', 'gb:6478083155', '4:gb|deel'),
  ('appstore', 'sg:404249815', '2:sg|salesforce'),
  ('appstore', 'au:1021338425', '2:au|aircall'),
  ('appstore', 'ie:1030906799', '3:ie|ripl-social-media-marketing'),
  ('appstore', 'nz:6471394316', '3:nz|invideo-ai-video-editor'),
  ('appstore', 'nz:1030906799', '3:nz|ripl-social-media-marketing'),
  ('appstore', 'nz:1232780281', '5:nz|notion-ai'),
  ('appstore', 'au:598332111', '1:au|rev'),
  ('appstore', 'za:698070860', '5:za|polaris-office-ai'),
  ('appstore', 'ie:1232780281', '5:ie|notion-ai'),
  ('appstore', 'sg:1276437113', '1:sg|otter-ai'),
  ('appstore', 'za:1435480281', '3:za|boosted-ad-maker-by-lightricks'),
  ('appstore', 'ie:404249815', '2:ie|salesforce'),
  ('appstore', 'in:1276437113', '1:in|otter-ai');

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
