-- ============================================================
-- 20261021T004216_window_targets_20261021 — ROLLBACK
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
  ('appstore', 'ca:587244049', '4:ca|bamboohr'),
  ('appstore', 'gb:1297148884', '4:gb|hibob'),
  ('appstore', 'in:1454212098', '2:in|bigin'),
  ('appstore', 'gb:596927802', '2:gb|cloze'),
  ('appstore', 'ca:1454212098', '2:ca|bigin'),
  ('appstore', 'gb:1454212098', '2:gb|bigin'),
  ('appstore', 'gb:587244049', '4:gb|bamboohr'),
  ('appstore', 'ca:596927802', '2:ca|cloze'),
  ('appstore', 'au:1454212098', '2:au|bigin'),
  ('appstore', 'ca:674067680', '2:ca|streak'),
  ('appstore', 'za:1454212098', '2:za|bigin'),
  ('appstore', 'in:596927802', '2:in|cloze'),
  ('appstore', 'za:1037457231', '3:za|google-ads'),
  ('appstore', 'ca:6463116243', '5:ca|quillbot'),
  ('appstore', 'gb:674067680', '2:gb|streak'),
  ('appstore', 'in:6478083155', '4:in|deel'),
  ('appstore', 'nz:404249815', '2:nz|salesforce'),
  ('appstore', 'ca:789934914', '2:ca|badger-maps'),
  ('appstore', 'gb:1459654107', '2:gb|covve'),
  ('appstore', 'ie:910768078', '2:ie|linkedin-sales-navigator'),
  ('appstore', 'in:1156351688', '2:in|justcall'),
  ('appstore', 'in:6463164203', '1:in|fireflies-ai'),
  ('appstore', 'sg:1586861768', '3:sg|zeely-ai-marketing-platform'),
  ('appstore', 'sg:822797943', '5:sg|ginger'),
  ('appstore', 'za:921456160', '2:za|pipedrive'),
  ('appstore', 'ca:6463164203', '1:ca|fireflies-ai'),
  ('appstore', 'in:1459654107', '2:in|covve'),
  ('appstore', 'sg:6450364080', '1:sg|plaud'),
  ('appstore', 'us:6448556170', '5:us|wrtn'),
  ('appstore', 'za:6478083155', '4:za|deel'),
  ('appstore', 'au:596927802', '2:au|cloze'),
  ('appstore', 'in:598332111', '1:in|rev'),
  ('appstore', 'nz:921456160', '2:nz|pipedrive'),
  ('appstore', 'sg:1037457231', '3:sg|google-ads'),
  ('appstore', 'sg:1435480281', '3:sg|boosted-ad-maker-by-lightricks'),
  ('appstore', 'sg:1480649572', '1:sg|notta'),
  ('appstore', 'us:1618211441', '1:us|sembly-ai'),
  ('appstore', 'au:6478083155', '4:au|deel'),
  ('appstore', 'ca:1477264742', '1:ca|fellow');

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
