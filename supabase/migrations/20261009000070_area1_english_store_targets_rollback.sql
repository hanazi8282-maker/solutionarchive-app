-- ============================================================
-- 20261009000070_area1_english_store_targets — ROLLBACK
--
-- ⛔ 미적용 초안. 실행은 오케스트레이터 판단. 삭제 없음:
--   1) 이 마이그가 넣은 신규 7행(정확한 (source_key, product_ref) 7쌍) → status='failed'(planRevive 대상 아님 — 자동 부활 없음).
--      LIKE 패턴을 쓰지 않는다 — #464·v37·슬롯 A 의 us 행을 건드리지 않기 위해서.
--   2) 맞바꾸기로 정지한 구글 플레이 kr:ko 앵커 → 기록(review_targets_paused_20261009, reason 'v45 §1 %')의 prev_status 로 복원,
--      resumed_at 채움. 그 사이 사람이 다른 상태로 바꾼 행(failed 아님)은 건드리지 않는다. 슬롯 A 의 14행은 reason 이 달라 안 잡힌다.
--   결과: 구글 플레이 활성 수 = 적용 전과 같음(us:en 2 내림 · kr:ko 2 올림). 수집된 리뷰(analysis_inputs)는 그대로 남는다.
--   완전 삭제(신규 7행 DELETE)는 §10.2 예외 1번 — 사람 판단. 이 파일엔 넣지 않는다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _v45_rb (source_key text NOT NULL, product_ref text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _v45_rb (source_key, product_ref) VALUES
  ('appstore', 'us:6753818538'), ('appstore', 'us:1541170153'), ('appstore', 'us:6751613402'),
  ('appstore', 'us:6739429409'), ('appstore', 'us:6747801435'),
  ('googleplay', 'us:en:com.avoma.android'), ('googleplay', 'us:en:ai.meetjamie.expoapp');

CREATE TEMP TABLE _v45_rb_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

DO $$
DECLARE running_at text;
BEGIN
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN ('googleplay', 'appstore') AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM _v45_rb r
 WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref AND t.status <> 'failed';

CREATE TEMP TABLE _v45_restored (id uuid) ON COMMIT DROP;
WITH up AS (
  UPDATE public.review_targets t SET status = l.prev_status
    FROM public.review_targets_paused_20261009 l
   WHERE t.id = l.target_id AND l.reason LIKE 'v45 §1 %' AND l.resumed_at IS NULL AND t.status = 'failed'
  RETURNING t.id
)
INSERT INTO _v45_restored SELECT id FROM up;
UPDATE public.review_targets_paused_20261009 SET resumed_at = now()
 WHERE reason LIKE 'v45 §1 %' AND resumed_at IS NULL AND target_id IN (SELECT id FROM _v45_restored);

DO $$
DECLARE still int; restored int; n_in int; gp_before int; gp_after int;
BEGIN
  SELECT count(*) INTO n_in FROM _v45_rb;
  IF n_in <> 7 THEN RAISE EXCEPTION '입력 %쌍(기대 7)', n_in; END IF;
  SELECT count(*) INTO restored FROM _v45_restored;
  IF restored > 2 THEN RAISE EXCEPTION '복원 %행(> 2) — 기록 범위가 이상하다', restored; END IF;
  SELECT count(*) INTO still FROM public.review_targets t JOIN _v45_rb r USING (source_key, product_ref) WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '신규 %행이 아직 failed 가 아니다', still; END IF;
  SELECT n INTO gp_before FROM _v45_rb_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before THEN RAISE EXCEPTION '구글 플레이 활성 % → % (늘면 안 됨)', gp_before, gp_after; END IF;
  RAISE NOTICE 'v45 ① 롤백: googleplay 활성 % → % · kr:ko 복원 %', gp_before, gp_after, restored;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, status FROM public.review_targets WHERE label IN
--   ('1:us|tldv','1:us|avoma','1:us|fathom','1:us|granola','1:us|jamie','1:us-en|avoma','1:us-en|jamie');   -- 기대 7행 failed
-- SELECT t.product_ref, t.status, l.prev_status, l.resumed_at FROM public.review_targets t
--   JOIN public.review_targets_paused_20261009 l ON l.target_id = t.id WHERE l.reason LIKE 'v45 §1 %';     -- 기대 prev_status 와 같음 · resumed_at 있음
