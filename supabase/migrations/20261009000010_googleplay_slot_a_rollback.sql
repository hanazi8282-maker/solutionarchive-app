-- ============================================================
-- 20261009000010_googleplay_slot_a — 롤백
--
-- 정확히 정지 14행만 기록(review_targets_paused_20261009)의 이전 status 로 되돌리고, 신규 14쌍을 failed 로 내린다(자동 부활 안 됨).
-- 데이터를 지우지 않는다 — 기록 테이블은 남기고 resumed_at 만 채운다. 신규 14쌍이 그동안 모은 analysis_inputs·cursor 는 그대로.
-- 활성 수: 14 복귀 − 14 내림 → 구글 플레이 활성 순변화 0(롤백 뒤에도 늘지 않는다).
-- 멱등: 재실행하면 0행 갱신, 끝의 DO 가 최종 상태를 다시 확인한다.
-- 롤백 뒤 정방향을 다시 돌리면 상태 기계가 RAISE 한다(기록 resumed · 신규 쌍 존재) — 그때는 드라이런 재생성.
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다. 적용은 오케스트레이터.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _sar_pause (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sar_pause (id) VALUES
  ('d0e3c16a-cf10-46b1-af23-05e3a6de942a'), ('26c4b4e5-eb08-4d52-af3f-dc05f464aed4'), ('a6862741-952c-4659-802a-09ab8a2a4aa5'),
  ('867e5296-0365-4de7-8c21-975985477763'), ('8d626003-b88a-4b40-a6d0-6b379ea75e4e'), ('206a0e84-3523-4f12-aa96-710cd8601871'),
  ('7f887e8a-8905-4968-8ff2-8b33c2171f5c'), ('ffc2c726-be43-437b-b440-b941f8449112'), ('0f14a5a6-761b-40dd-baf5-d01333bc0de8'),
  ('28d7ebbd-b03f-4ff2-8494-66693652a702'), ('8b65bc9e-e7d2-4a49-baa7-402a860656b0'), ('1f0cbbdb-96c2-4cf7-8179-4ff8fa2d214d'),
  ('0454be9c-029b-488d-872d-6d75368860ae'), ('1b465428-95b1-41c7-89ca-1fea40fb50b8');

CREATE TEMP TABLE _sar_new (product_ref text PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;
INSERT INTO _sar_new (product_ref, label) VALUES
  ('us:en:ai.krisp.krispMobile', '1:us-en|krisp'), ('us:en:com.avoma.android', '1:us-en|avoma'), ('us:en:co.fellow.app', '1:us-en|fellow'),
  ('us:en:com.meetgeek.assistant', '1:us-en|meetgeek'), ('us:en:com.semblyai.android', '1:us-en|sembly-ai'), ('us:en:ai.meetjamie.expoapp', '1:us-en|jamie'),
  ('us:en:ai.circleback.app', '1:us-en|circleback'), ('us:en:com.rev.revcorder', '1:us-en|rev'), ('us:en:com.triplewhale.android.v2', '3:us-en|triple-whale'),
  ('us:en:com.people.rippling', '4:us-en|rippling'), ('us:en:com.gusto.money', '4:us-en|gusto'), ('us:en:com.mokinetworks.bamboohr', '4:us-en|bamboohr'),
  ('us:en:com.hibob', '4:us-en|hibob'), ('us:en:com.personio', '4:us-en|personio');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_targets_paused_20261009';
  IF n <> 1 THEN RAISE EXCEPTION '기록 테이블 없음 — 정방향 미적용(되돌릴 것 없음)'; END IF;
  SELECT count(*) INTO n FROM public.review_targets_paused_20261009 WHERE target_id IN (SELECT id FROM _sar_pause);
  IF n <> 14 THEN RAISE EXCEPTION '정지 기록 %행(기대 14)', n; END IF;
END $$;

CREATE TEMP TABLE _sar_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

-- 1) 신규 14쌍 → failed (이 마이그가 넣은 라벨인 행만)
UPDATE public.review_targets t SET status = 'failed'
  FROM _sar_new v
 WHERE t.source_key = 'googleplay' AND t.product_ref = v.product_ref AND t.label = v.label AND t.status <> 'failed';

-- 2) 정지 14행 → 기록의 이전 status (아직 정지 상태인 것만)
UPDATE public.review_targets t SET status = l.prev_status
  FROM public.review_targets_paused_20261009 l
 WHERE t.id = l.target_id AND t.id IN (SELECT id FROM _sar_pause) AND l.resumed_at IS NULL AND t.status = 'failed';

UPDATE public.review_targets_paused_20261009 SET resumed_at = now()
 WHERE target_id IN (SELECT id FROM _sar_pause) AND resumed_at IS NULL;

DO $$
DECLARE restored int; new_down int; gp_before int; gp_after int;
BEGIN
  SELECT count(*) INTO restored FROM public.review_targets t JOIN public.review_targets_paused_20261009 l ON l.target_id = t.id
   WHERE t.id IN (SELECT id FROM _sar_pause) AND t.status = l.prev_status AND l.resumed_at IS NOT NULL;
  IF restored <> 14 THEN RAISE EXCEPTION '복원 %행(기대 14)', restored; END IF;
  SELECT count(*) INTO new_down FROM public.review_targets t JOIN _sar_new v ON v.product_ref = t.product_ref AND v.label = t.label
   WHERE t.source_key = 'googleplay' AND t.status = 'failed';
  IF new_down <> 14 THEN RAISE EXCEPTION '신규 쌍 failed %행(기대 14)', new_down; END IF;
  SELECT n INTO gp_before FROM _sar_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before OR gp_after > 88 THEN RAISE EXCEPTION '롤백이 활성 수를 늘렸다 % → %', gp_before, gp_after; END IF;
  RAISE NOTICE '슬롯 A 롤백: 복원 14 · 신규 failed 14 · googleplay 활성 %→%', gp_before, gp_after;
END $$;

COMMIT;

-- 확인
-- SELECT status, count(*) FROM public.review_targets WHERE id IN (SELECT target_id FROM public.review_targets_paused_20261009) GROUP BY 1;  -- 기대 active 14
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';                                         -- 기대 88
