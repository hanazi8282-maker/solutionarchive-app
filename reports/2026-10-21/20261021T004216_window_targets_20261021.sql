-- ============================================================
-- 20261021T004216_window_targets_20261021
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 reports/2026-10-21/window-probe.json 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets 39행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
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
-- 롤백: window-discovery-rollback-20261021T004216.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ('appstore', 'us:587244049'), ('appstore', 'us:1297148884'), ('appstore', 'us:1454212098'), ('appstore', 'us:596927802'), ('appstore', 'us:1454212098'), ('appstore', 'us:1454212098'), ('appstore', 'us:587244049'), ('appstore', 'us:596927802'), ('appstore', 'us:1454212098'), ('appstore', 'us:674067680'), ('appstore', 'us:1454212098'), ('appstore', 'us:596927802'), ('appstore', 'us:1037457231'), ('appstore', 'kr:6463116243'), ('appstore', 'us:674067680'), ('appstore', 'kr:6478083155'), ('appstore', 'us:404249815'), ('appstore', 'us:789934914'), ('appstore', 'us:1459654107'), ('appstore', 'kr:910768078'), ('appstore', 'us:1156351688'), ('appstore', 'kr:6463164203'), ('appstore', 'us:1586861768'), ('appstore', 'us:822797943'), ('appstore', 'us:921456160'), ('appstore', 'kr:6463164203'), ('appstore', 'us:1459654107'), ('appstore', 'us:6450364080'), ('appstore', 'kr:6448556170'), ('appstore', 'us:6478083155'), ('appstore', 'us:596927802'), ('appstore', 'kr:598332111'), ('appstore', 'us:921456160'), ('appstore', 'us:1037457231'), ('appstore', 'us:1435480281'), ('appstore', 'kr:1480649572'), ('appstore', 'kr:1618211441'), ('appstore', 'kr:6478083155'), ('appstore', 'kr:1477264742')) v(s, a)
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
  ('appstore', 'ca:587244049', '4:ca|bamboohr', 'us:587244049'),  -- 요청당 새 글 50
  ('appstore', 'gb:1297148884', '4:gb|hibob', 'us:1297148884'),  -- 요청당 새 글 50
  ('appstore', 'in:1454212098', '2:in|bigin', 'us:1454212098'),  -- 요청당 새 글 50
  ('appstore', 'gb:596927802', '2:gb|cloze', 'us:596927802'),  -- 요청당 새 글 48
  ('appstore', 'ca:1454212098', '2:ca|bigin', 'us:1454212098'),  -- 요청당 새 글 36
  ('appstore', 'gb:1454212098', '2:gb|bigin', 'us:1454212098'),  -- 요청당 새 글 32
  ('appstore', 'gb:587244049', '4:gb|bamboohr', 'us:587244049'),  -- 요청당 새 글 31
  ('appstore', 'ca:596927802', '2:ca|cloze', 'us:596927802'),  -- 요청당 새 글 24
  ('appstore', 'au:1454212098', '2:au|bigin', 'us:1454212098'),  -- 요청당 새 글 21
  ('appstore', 'ca:674067680', '2:ca|streak', 'us:674067680'),  -- 요청당 새 글 20
  ('appstore', 'za:1454212098', '2:za|bigin', 'us:1454212098'),  -- 요청당 새 글 16
  ('appstore', 'in:596927802', '2:in|cloze', 'us:596927802'),  -- 요청당 새 글 15
  ('appstore', 'za:1037457231', '3:za|google-ads', 'us:1037457231'),  -- 요청당 새 글 15
  ('appstore', 'ca:6463116243', '5:ca|quillbot', 'kr:6463116243'),  -- 요청당 새 글 14
  ('appstore', 'gb:674067680', '2:gb|streak', 'us:674067680'),  -- 요청당 새 글 14
  ('appstore', 'in:6478083155', '4:in|deel', 'kr:6478083155'),  -- 요청당 새 글 14
  ('appstore', 'nz:404249815', '2:nz|salesforce', 'us:404249815'),  -- 요청당 새 글 14
  ('appstore', 'ca:789934914', '2:ca|badger-maps', 'us:789934914'),  -- 요청당 새 글 13
  ('appstore', 'gb:1459654107', '2:gb|covve', 'us:1459654107'),  -- 요청당 새 글 13
  ('appstore', 'ie:910768078', '2:ie|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 13
  ('appstore', 'in:1156351688', '2:in|justcall', 'us:1156351688'),  -- 요청당 새 글 13
  ('appstore', 'in:6463164203', '1:in|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 13
  ('appstore', 'sg:1586861768', '3:sg|zeely-ai-marketing-platform', 'us:1586861768'),  -- 요청당 새 글 13
  ('appstore', 'sg:822797943', '5:sg|ginger', 'us:822797943'),  -- 요청당 새 글 13
  ('appstore', 'za:921456160', '2:za|pipedrive', 'us:921456160'),  -- 요청당 새 글 13
  ('appstore', 'ca:6463164203', '1:ca|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 12
  ('appstore', 'in:1459654107', '2:in|covve', 'us:1459654107'),  -- 요청당 새 글 12
  ('appstore', 'sg:6450364080', '1:sg|plaud', 'us:6450364080'),  -- 요청당 새 글 12
  ('appstore', 'us:6448556170', '5:us|wrtn', 'kr:6448556170'),  -- 요청당 새 글 12
  ('appstore', 'za:6478083155', '4:za|deel', 'us:6478083155'),  -- 요청당 새 글 12
  ('appstore', 'au:596927802', '2:au|cloze', 'us:596927802'),  -- 요청당 새 글 11
  ('appstore', 'in:598332111', '1:in|rev', 'kr:598332111'),  -- 요청당 새 글 11
  ('appstore', 'nz:921456160', '2:nz|pipedrive', 'us:921456160'),  -- 요청당 새 글 11
  ('appstore', 'sg:1037457231', '3:sg|google-ads', 'us:1037457231'),  -- 요청당 새 글 11
  ('appstore', 'sg:1435480281', '3:sg|boosted-ad-maker-by-lightricks', 'us:1435480281'),  -- 요청당 새 글 11
  ('appstore', 'sg:1480649572', '1:sg|notta', 'kr:1480649572'),  -- 요청당 새 글 11
  ('appstore', 'us:1618211441', '1:us|sembly-ai', 'kr:1618211441'),  -- 요청당 새 글 11
  ('appstore', 'au:6478083155', '4:au|deel', 'kr:6478083155'),  -- 요청당 새 글 10
  ('appstore', 'ca:1477264742', '1:ca|fellow', 'kr:1477264742')  -- 요청당 새 글 10
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
  IF ins > 39 THEN RAISE EXCEPTION '삽입 %행 > 후보 39행', ins; END IF;
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
  RAISE NOTICE 'window targets: 삽입 %행(후보 39) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (('appstore', 'ca:587244049'), ('appstore', 'gb:1297148884'), ('appstore', 'in:1454212098'), ('appstore', 'gb:596927802'), ('appstore', 'ca:1454212098'), ('appstore', 'gb:1454212098'), ('appstore', 'gb:587244049'), ('appstore', 'ca:596927802'), ('appstore', 'au:1454212098'), ('appstore', 'ca:674067680'), ('appstore', 'za:1454212098'), ('appstore', 'in:596927802'), ('appstore', 'za:1037457231'), ('appstore', 'ca:6463116243'), ('appstore', 'gb:674067680'), ('appstore', 'in:6478083155'), ('appstore', 'nz:404249815'), ('appstore', 'ca:789934914'), ('appstore', 'gb:1459654107'), ('appstore', 'ie:910768078'), ('appstore', 'in:1156351688'), ('appstore', 'in:6463164203'), ('appstore', 'sg:1586861768'), ('appstore', 'sg:822797943'), ('appstore', 'za:921456160'), ('appstore', 'ca:6463164203'), ('appstore', 'in:1459654107'), ('appstore', 'sg:6450364080'), ('appstore', 'us:6448556170'), ('appstore', 'za:6478083155'), ('appstore', 'au:596927802'), ('appstore', 'in:598332111'), ('appstore', 'nz:921456160'), ('appstore', 'sg:1037457231'), ('appstore', 'sg:1435480281'), ('appstore', 'sg:1480649572'), ('appstore', 'us:1618211441'), ('appstore', 'au:6478083155'), ('appstore', 'ca:1477264742'));   -- 기대 39행 active
