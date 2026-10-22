-- ============================================================
-- 20261022T004549_window_targets_20261022 — ROLLBACK
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
  ('appstore', 'au:1016366447', 'notes:au|bear'),
  ('appstore', 'au:281796108', 'notes:au|evernote'),
  ('appstore', 'au:507014023', '07-ecommerce-ops:au|aftership'),
  ('appstore', 'ca:1016366447', 'notes:ca|bear'),
  ('appstore', 'ca:281796108', 'notes:ca|evernote'),
  ('appstore', 'ca:507014023', '07-ecommerce-ops:ca|aftership'),
  ('appstore', 'gb:1016366447', 'notes:gb|bear'),
  ('appstore', 'gb:281796108', 'notes:gb|evernote'),
  ('appstore', 'gb:507014023', '07-ecommerce-ops:gb|aftership'),
  ('appstore', 'ie:281796108', 'notes:ie|evernote'),
  ('appstore', 'ie:507014023', '07-ecommerce-ops:ie|aftership'),
  ('appstore', 'in:1016366447', 'notes:in|bear'),
  ('appstore', 'in:281796108', 'notes:in|evernote'),
  ('appstore', 'in:507014023', '07-ecommerce-ops:in|aftership'),
  ('appstore', 'nz:281796108', 'notes:nz|evernote'),
  ('appstore', 'nz:507014023', '07-ecommerce-ops:nz|aftership'),
  ('appstore', 'sg:281796108', 'notes:sg|evernote'),
  ('appstore', 'sg:507014023', '07-ecommerce-ops:sg|aftership'),
  ('appstore', 'za:281796108', 'notes:za|evernote'),
  ('appstore', 'za:507014023', '07-ecommerce-ops:za|aftership'),
  ('appstore', 'ca:561683423', '2:ca|bitrix24'),
  ('appstore', 'sg:1016366447', 'notes:sg|bear'),
  ('appstore', 'in:561683423', '2:in|bitrix24'),
  ('appstore', 'gb:561683423', '2:gb|bitrix24'),
  ('appstore', 'nz:1016366447', 'notes:nz|bear'),
  ('appstore', 'ie:1016366447', 'notes:ie|bear'),
  ('appstore', 'ca:965269916', '2:ca|daylite'),
  ('appstore', 'au:561683423', '2:au|bitrix24'),
  ('appstore', 'gb:965269916', '2:gb|daylite'),
  ('appstore', 'ca:972151811', '07-ecommerce-ops:ca|shipstation'),
  ('appstore', 'au:965269916', '2:au|daylite'),
  ('appstore', 'za:1016366447', 'notes:za|bear'),
  ('appstore', 'gb:789934914', '2:gb|badger-maps'),
  ('appstore', 'gb:953610296', '2:gb|map-my-customers');

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
