-- ============================================================
-- 20261017000010_window_targets_20261017 — ROLLBACK
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
  ('appstore', 'gb:964397083', '3:gb|meta-ads-manager'),
  ('appstore', 'in:964397083', '3:in|meta-ads-manager'),
  ('appstore', 'za:964397083', '3:za|meta-ads-manager'),
  ('appstore', 'gb:1435480281', '3:gb|boosted-ad-maker-by-lightricks'),
  ('appstore', 'in:1435480281', '3:in|boosted-ad-maker-by-lightricks'),
  ('appstore', 'za:897446215', '3:za|canva'),
  ('appstore', 'gb:1586861768', '3:gb|zeely-ai-marketing-platform'),
  ('appstore', 'us:698070860', '5:us|polaris-office-ai'),
  ('appstore', 'gb:698070860', '5:gb|polaris-office-ai'),
  ('appstore', 'ca:698070860', '5:ca|polaris-office-ai'),
  ('appstore', 'in:698070860', '5:in|polaris-office-ai'),
  ('appstore', 'gb:1037457231', '3:gb|google-ads'),
  ('appstore', 'in:1037457231', '3:in|google-ads'),
  ('appstore', 'gb:1158877342', '5:gb|grammarly'),
  ('appstore', 'in:1158877342', '5:in|grammarly'),
  ('appstore', 'sg:1158877342', '5:sg|grammarly'),
  ('appstore', 'ie:1158877342', '5:ie|grammarly'),
  ('appstore', 'nz:1158877342', '5:nz|grammarly'),
  ('appstore', 'za:1158877342', '5:za|grammarly'),
  ('appstore', 'gb:1232780281', '5:gb|notion-ai'),
  ('appstore', 'in:1232780281', '5:in|notion-ai'),
  ('appstore', 'sg:1232780281', '5:sg|notion-ai'),
  ('appstore', 'za:1232780281', '5:za|notion-ai'),
  ('appstore', 'gb:1030906799', '3:gb|ripl-social-media-marketing'),
  ('appstore', 'gb:6471394316', '3:gb|invideo-ai-video-editor'),
  ('appstore', 'ca:6471394316', '3:ca|invideo-ai-video-editor'),
  ('appstore', 'in:6471394316', '3:in|invideo-ai-video-editor'),
  ('appstore', 'sg:6471394316', '3:sg|invideo-ai-video-editor'),
  ('appstore', 'za:6471394316', '3:za|invideo-ai-video-editor'),
  ('appstore', 'gb:6740024098', '3:gb|pollo-ai-ai-video-image'),
  ('appstore', 'us:341249709', '3:us|hootsuite-owlywriter'),
  ('appstore', 'gb:341249709', '3:gb|hootsuite-owlywriter'),
  ('appstore', 'in:341249709', '3:in|hootsuite-owlywriter'),
  ('appstore', 'sg:341249709', '3:sg|hootsuite-owlywriter'),
  ('appstore', 'ie:341249709', '3:ie|hootsuite-owlywriter'),
  ('appstore', 'nz:341249709', '3:nz|hootsuite-owlywriter'),
  ('appstore', 'za:341249709', '3:za|hootsuite-owlywriter'),
  ('appstore', 'gb:822797943', '5:gb|ginger'),
  ('appstore', 'ca:822797943', '5:ca|ginger'),
  ('appstore', 'in:822797943', '5:in|ginger'),
  ('appstore', 'gb:1487937127', '5:gb|craft-docs'),
  ('appstore', 'in:1487937127', '5:in|craft-docs'),
  ('appstore', 'us:6478083155', '4:us|deel'),
  ('appstore', 'ie:6471394316', '3:ie|invideo-ai-video-editor'),
  ('appstore', 'ca:6740024098', '3:ca|pollo-ai-ai-video-image'),
  ('appstore', 'in:6463116243', '5:in|quillbot'),
  ('appstore', 'au:1435480281', '3:au|boosted-ad-maker-by-lightricks'),
  ('appstore', 'gb:6478083155', '4:gb|deel'),
  ('appstore', 'ie:1030906799', '3:ie|ripl-social-media-marketing'),
  ('appstore', 'nz:6471394316', '3:nz|invideo-ai-video-editor'),
  ('appstore', 'nz:1232780281', '5:nz|notion-ai'),
  ('appstore', 'nz:1030906799', '3:nz|ripl-social-media-marketing'),
  ('appstore', 'za:698070860', '5:za|polaris-office-ai'),
  ('appstore', 'ie:1232780281', '5:ie|notion-ai'),
  ('appstore', 'za:1435480281', '3:za|boosted-ad-maker-by-lightricks'),
  ('appstore', 'za:1030906799', '3:za|ripl-social-media-marketing'),
  ('appstore', 'za:1586861768', '3:za|zeely-ai-marketing-platform'),
  ('appstore', 'sg:698070860', '5:sg|polaris-office-ai'),
  ('appstore', 'au:6740024098', '3:au|pollo-ai-ai-video-image'),
  ('appstore', 'in:1030906799', '3:in|ripl-social-media-marketing'),
  ('appstore', 'nz:964397083', '3:nz|meta-ads-manager'),
  ('appstore', 'us:1511861727', '3:us|triple-whale'),
  ('appstore', 'gb:6463116243', '5:gb|quillbot'),
  ('appstore', 'in:1107711722', '2:in|hubspot-sales-hub'),
  ('appstore', 'ie:964397083', '3:ie|meta-ads-manager'),
  ('appstore', 'ca:6478083155', '4:ca|deel'),
  ('appstore', 'sg:1487937127', '5:sg|craft-docs'),
  ('appstore', 'za:1487937127', '5:za|craft-docs'),
  ('appstore', 'gb:1628773284', '5:gb|wordtune'),
  ('appstore', 'za:1037457231', '3:za|google-ads'),
  ('appstore', 'ca:6463116243', '5:ca|quillbot'),
  ('appstore', 'in:6478083155', '4:in|deel'),
  ('appstore', 'sg:1586861768', '3:sg|zeely-ai-marketing-platform'),
  ('appstore', 'sg:822797943', '5:sg|ginger'),
  ('appstore', 'us:6448556170', '5:us|wrtn'),
  ('appstore', 'sg:1435480281', '3:sg|boosted-ad-maker-by-lightricks'),
  ('appstore', 'sg:1037457231', '3:sg|google-ads'),
  ('appstore', 'au:6478083155', '4:au|deel'),
  ('appstore', 'nz:1107711722', '2:nz|hubspot-sales-hub'),
  ('appstore', 'gb:1448204455', '3:gb|flyer-maker-banner-ads-maker'),
  ('appstore', 'nz:698070860', '5:nz|polaris-office-ai'),
  ('appstore', 'in:6740024098', '3:in|pollo-ai-ai-video-image'),
  ('appstore', 'au:6463116243', '5:au|quillbot'),
  ('appstore', 'sg:1107711722', '2:sg|hubspot-sales-hub'),
  ('appstore', 'nz:1586861768', '3:nz|zeely-ai-marketing-platform'),
  ('appstore', 'za:6463116243', '5:za|quillbot'),
  ('appstore', 'ie:822797943', '5:ie|ginger'),
  ('appstore', 'ca:6448556170', '5:ca|wrtn'),
  ('appstore', 'ca:1289289459', '2:ca|gong'),
  ('appstore', 'ie:1435480281', '3:ie|boosted-ad-maker-by-lightricks'),
  ('appstore', 'nz:1435480281', '3:nz|boosted-ad-maker-by-lightricks'),
  ('appstore', 'ca:1448204455', '3:ca|flyer-maker-banner-ads-maker'),
  ('appstore', 'ie:1487937127', '5:ie|craft-docs'),
  ('appstore', 'ca:1493170277', '2:ca|zoominfo'),
  ('appstore', 'gb:977304452', '2:gb|clari'),
  ('appstore', 'za:1448204455', '3:za|flyer-maker-banner-ads-maker'),
  ('appstore', 'sg:1030906799', '3:sg|ripl-social-media-marketing'),
  ('appstore', 'nz:1487937127', '5:nz|craft-docs'),
  ('appstore', 'gb:6740884542', '5:gb|sudowrite'),
  ('appstore', 'ca:6740884542', '5:ca|sudowrite'),
  ('appstore', 'ie:1107711722', '2:ie|hubspot-sales-hub'),
  ('appstore', 'ca:6474658497', '2:ca|instantly'),
  ('appstore', 'gb:6751626758', '3:gb|ai-product-video-ad-pixury'),
  ('appstore', 'au:6751626758', '3:au|ai-product-video-ad-pixury'),
  ('appstore', 'in:6751626758', '3:in|ai-product-video-ad-pixury'),
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
