-- ============================================================
-- 20261019000010_window_targets_20261019 — ROLLBACK
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
  ('appstore', 'us:507014023', '07-ecommerce-ops:us|aftership'),
  ('appstore', 'us:972151811', '07-ecommerce-ops:us|shipstation'),
  ('appstore', 'us:598332111', '1:us|rev'),
  ('appstore', 'us:1480649572', '1:us|notta'),
  ('appstore', 'us:6754837598', '1:us|bluedot'),
  ('appstore', 'us:6738971048', '1:us|circleback'),
  ('appstore', 'us:6463164203', '1:us|fireflies-ai'),
  ('appstore', 'us:6739429409', '1:us|granola'),
  ('appstore', 'us:6747801435', '1:us|jamie'),
  ('appstore', 'us:6740535865', '1:us|krisp'),
  ('appstore', 'us:6476133984', '1:us|meetgeek'),
  ('appstore', 'us:6450364080', '1:us|plaud'),
  ('appstore', 'us:6575345796', '1:us|read-ai'),
  ('appstore', 'us:6474231719', '3:us|miricanvas'),
  ('appstore', 'us:587244049', '4:us|bamboohr'),
  ('appstore', 'us:1231325957', '4:us|rippling'),
  ('appstore', 'us:1297148884', '4:us|hibob'),
  ('appstore', 'us:1478804271', '4:us|gusto'),
  ('appstore', 'us:6478083155', '4:us|deel'),
  ('googleplay', 'us:en:com.aisense.otter', '1:us-en|otter-ai'),
  ('googleplay', 'us:en:ai.fireflies.mobile', '1:us-en|fireflies-ai'),
  ('googleplay', 'us:en:com.langogo.transcribe', '1:us-en|notta'),
  ('googleplay', 'us:en:ai.plaud.android.plaud', '1:us-en|plaud'),
  ('googleplay', 'us:en:bluedot.ai.notetaker', '1:us-en|bluedot'),
  ('googleplay', 'us:en:ai.meetjamie.expoapp', '1:us-en|jamie'),
  ('googleplay', 'us:en:com.avoma.android', '1:us-en|avoma'),
  ('googleplay', 'us:en:com.deel.app', '4:us-en|deel'),
  ('googleplay', 'us:en:com.workday.workdroidapp', '4:us-en|workday'),
  ('googleplay', 'us:en:com.canva.editor', '3:us-en|canva');

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
