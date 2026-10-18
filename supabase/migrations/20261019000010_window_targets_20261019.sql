-- ============================================================
-- 20261019000010_window_targets_20261019
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 reports/2026-10-19/english-window-ledger.json 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets 29행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
--   project_id 는 앵커(같은 source_key 의 기존 타깃 anchor_ref)에서 읽는다 — uuid 하드코딩 없음.
--   앵커가 0행이면 사전 검사가 RAISE, 2행 이상이면 스칼라 서브쿼리가 21000 으로 던진다.
--   중복 방지: 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 NOT EXISTS 로 건너뛴다.
--   status='active' · last_run_at NULL(미방문 우선, 20261009000070 과 같은 방식) · 카운터는 컬럼 기본값.
-- 라벨: <영역>:<국가 접두>|<제품> (앱스토어 접두 = 국가, 구글 플레이 = <gl>-<hl>). 영역은 앵커 라벨 첫 ':' 앞.
-- 손대지 않는 것: review_sources · review_source_ramp(요청 예산 불변 — 같은 소스 안 창문이라 예산을 나눠 쓴다).
--
-- 사후 가드(어긋나면 RAISE → 전체 롤백):
--   · 구글 플레이 활성이 늘었고 80(GOOGLEPLAY_FROZEN_ACTIVE) 초과면 RAISE — 동결선 예외는 PR #464 17개 한정.
--     넘으면 1:1 맞바꾸기(20261009000070 방식) 또는 사람 판단으로 다시 만든다.
--   · 앱스토어 활성 ÷ enabled 소스 활성 > 0.3(SHARE_GATE) 이고 앱스토어 행을 넣었으면 RAISE.
-- 롤백: 20261019000010_window_targets_20261019_rollback.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ('appstore', 'kr:507014023'), ('appstore', 'kr:972151811'), ('appstore', 'kr:598332111'), ('appstore', 'kr:1480649572'), ('appstore', 'kr:6754837598'), ('appstore', 'kr:6738971048'), ('appstore', 'kr:6463164203'), ('appstore', 'kr:6739429409'), ('appstore', 'kr:6747801435'), ('appstore', 'kr:6740535865'), ('appstore', 'kr:6476133984'), ('appstore', 'kr:6450364080'), ('appstore', 'kr:6575345796'), ('appstore', 'kr:6474231719'), ('appstore', 'kr:587244049'), ('appstore', 'kr:1231325957'), ('appstore', 'kr:1297148884'), ('appstore', 'kr:1478804271'), ('appstore', 'kr:6478083155'), ('googleplay', 'kr:ko:com.aisense.otter'), ('googleplay', 'kr:ko:ai.fireflies.mobile'), ('googleplay', 'kr:ko:com.langogo.transcribe'), ('googleplay', 'kr:ko:ai.plaud.android.plaud'), ('googleplay', 'kr:ko:bluedot.ai.notetaker'), ('googleplay', 'kr:ko:ai.meetjamie.expoapp'), ('googleplay', 'kr:ko:com.avoma.android'), ('googleplay', 'kr:ko:com.deel.app'), ('googleplay', 'kr:ko:com.workday.workdroidapp'), ('googleplay', 'kr:ko:com.canva.editor')) v(s, a)
--     LEFT JOIN public.review_targets t ON t.source_key = v.s AND t.product_ref = v.a GROUP BY 1, 2;   -- 기대: 전부 1
--   SELECT source_key, status, count(*) FROM public.review_targets WHERE source_key IN ('appstore','googleplay') GROUP BY 1, 2;
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _wt_new (
  source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, anchor_ref text NOT NULL, project_id uuid,
  PRIMARY KEY (source_key, product_ref)
) ON COMMIT DROP;
INSERT INTO _wt_new (source_key, product_ref, label, anchor_ref) VALUES
  ('appstore', 'us:507014023', '07-ecommerce-ops:us|aftership', 'kr:507014023'),  -- 요청당 새 글 20
  ('appstore', 'us:972151811', '07-ecommerce-ops:us|shipstation', 'kr:972151811'),  -- 요청당 새 글 20
  ('appstore', 'us:598332111', '1:us|rev', 'kr:598332111'),  -- 요청당 새 글 20
  ('appstore', 'us:1480649572', '1:us|notta', 'kr:1480649572'),  -- 요청당 새 글 20
  ('appstore', 'us:6754837598', '1:us|bluedot', 'kr:6754837598'),  -- 요청당 새 글 20
  ('appstore', 'us:6738971048', '1:us|circleback', 'kr:6738971048'),  -- 요청당 새 글 20
  ('appstore', 'us:6463164203', '1:us|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 20
  ('appstore', 'us:6739429409', '1:us|granola', 'kr:6739429409'),  -- 요청당 새 글 20
  ('appstore', 'us:6747801435', '1:us|jamie', 'kr:6747801435'),  -- 요청당 새 글 20
  ('appstore', 'us:6740535865', '1:us|krisp', 'kr:6740535865'),  -- 요청당 새 글 20
  ('appstore', 'us:6476133984', '1:us|meetgeek', 'kr:6476133984'),  -- 요청당 새 글 20
  ('appstore', 'us:6450364080', '1:us|plaud', 'kr:6450364080'),  -- 요청당 새 글 20
  ('appstore', 'us:6575345796', '1:us|read-ai', 'kr:6575345796'),  -- 요청당 새 글 20
  ('appstore', 'us:6474231719', '3:us|miricanvas', 'kr:6474231719'),  -- 요청당 새 글 20
  ('appstore', 'us:587244049', '4:us|bamboohr', 'kr:587244049'),  -- 요청당 새 글 20
  ('appstore', 'us:1231325957', '4:us|rippling', 'kr:1231325957'),  -- 요청당 새 글 20
  ('appstore', 'us:1297148884', '4:us|hibob', 'kr:1297148884'),  -- 요청당 새 글 20
  ('appstore', 'us:1478804271', '4:us|gusto', 'kr:1478804271'),  -- 요청당 새 글 20
  ('appstore', 'us:6478083155', '4:us|deel', 'kr:6478083155'),  -- 요청당 새 글 20
  ('googleplay', 'us:en:com.aisense.otter', '1:us-en|otter-ai', 'kr:ko:com.aisense.otter'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:ai.fireflies.mobile', '1:us-en|fireflies-ai', 'kr:ko:ai.fireflies.mobile'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:com.langogo.transcribe', '1:us-en|notta', 'kr:ko:com.langogo.transcribe'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:ai.plaud.android.plaud', '1:us-en|plaud', 'kr:ko:ai.plaud.android.plaud'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:bluedot.ai.notetaker', '1:us-en|bluedot', 'kr:ko:bluedot.ai.notetaker'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:ai.meetjamie.expoapp', '1:us-en|jamie', 'kr:ko:ai.meetjamie.expoapp'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:com.avoma.android', '1:us-en|avoma', 'kr:ko:com.avoma.android'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:com.deel.app', '4:us-en|deel', 'kr:ko:com.deel.app'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:com.workday.workdroidapp', '4:us-en|workday', 'kr:ko:com.workday.workdroidapp'),  -- 요청당 새 글 5
  ('googleplay', 'us:en:com.canva.editor', '3:us-en|canva', 'kr:ko:com.canva.editor')  -- 요청당 새 글 5
;

UPDATE _wt_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = n.source_key AND k.product_ref = n.anchor_ref);

CREATE TEMP TABLE _wt_before ON COMMIT DROP AS
SELECT source_key, count(*)::int AS n FROM public.review_targets WHERE status = 'active' GROUP BY 1;

DO $$
DECLARE off_sources text; running_at text; orphan text;
BEGIN
  SELECT string_agg(k, ',') INTO off_sources FROM (SELECT DISTINCT source_key AS k FROM _wt_new) v
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _wt_new) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
  SELECT string_agg(source_key || ':' || anchor_ref, ', ') INTO orphan FROM _wt_new WHERE project_id IS NULL;
  IF orphan IS NOT NULL THEN RAISE EXCEPTION '앵커 타깃 없음: %', orphan; END IF;
END $$;

CREATE TEMP TABLE _wt_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, n.source_key, n.product_ref, n.label, 'active', NULL, NULL
    FROM _wt_new n
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _wt_ins SELECT id, source_key FROM ins;

DO $$
DECLARE ins int; gp_before int; gp_after int; as_ins int; as_active int; total_active int;
BEGIN
  SELECT count(*) INTO ins FROM _wt_ins;
  IF ins > 29 THEN RAISE EXCEPTION '삽입 %행 > 후보 29행', ins; END IF;
  SELECT coalesce((SELECT n FROM _wt_before WHERE source_key = 'googleplay'), 0) INTO gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before AND gp_after > 80 THEN
    RAISE EXCEPTION '구글 플레이 활성 % → % (동결선 80 초과) — 1:1 맞바꾸기 또는 사람 판단', gp_before, gp_after;
  END IF;
  SELECT count(*) INTO as_ins FROM _wt_ins WHERE source_key = 'appstore';
  SELECT count(*) INTO as_active FROM public.review_targets WHERE source_key = 'appstore' AND status = 'active';
  SELECT count(*) INTO total_active FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.status = 'active';
  IF as_ins > 0 AND as_active > 0.3 * total_active THEN
    RAISE EXCEPTION '앱스토어 활성 %/% > 0.3', as_active, total_active;
  END IF;
  RAISE NOTICE 'window targets: 삽입 %행(후보 29) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (('appstore', 'us:507014023'), ('appstore', 'us:972151811'), ('appstore', 'us:598332111'), ('appstore', 'us:1480649572'), ('appstore', 'us:6754837598'), ('appstore', 'us:6738971048'), ('appstore', 'us:6463164203'), ('appstore', 'us:6739429409'), ('appstore', 'us:6747801435'), ('appstore', 'us:6740535865'), ('appstore', 'us:6476133984'), ('appstore', 'us:6450364080'), ('appstore', 'us:6575345796'), ('appstore', 'us:6474231719'), ('appstore', 'us:587244049'), ('appstore', 'us:1231325957'), ('appstore', 'us:1297148884'), ('appstore', 'us:1478804271'), ('appstore', 'us:6478083155'), ('googleplay', 'us:en:com.aisense.otter'), ('googleplay', 'us:en:ai.fireflies.mobile'), ('googleplay', 'us:en:com.langogo.transcribe'), ('googleplay', 'us:en:ai.plaud.android.plaud'), ('googleplay', 'us:en:bluedot.ai.notetaker'), ('googleplay', 'us:en:ai.meetjamie.expoapp'), ('googleplay', 'us:en:com.avoma.android'), ('googleplay', 'us:en:com.deel.app'), ('googleplay', 'us:en:com.workday.workdroidapp'), ('googleplay', 'us:en:com.canva.editor'));   -- 기대 29행 active
