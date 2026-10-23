-- ============================================================
-- 20261023T004536_window_targets_20261023
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 reports/2026-10-23/window-probe.json 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets 37행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
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
-- 롤백: window-discovery-rollback-20261023T004536.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ('appstore', 'us:1094699978'), ('appstore', 'kr:910768078'), ('appstore', 'kr:6463116243'), ('appstore', 'us:6754837598'), ('appstore', 'us:1459654107'), ('appstore', 'us:953610296'), ('appstore', 'us:1448204455'), ('appstore', 'us:337938121'), ('appstore', 'us:941438829'), ('appstore', 'us:6740024098'), ('appstore', 'kr:698070860'), ('appstore', 'us:6450364080'), ('appstore', 'us:587244049'), ('appstore', 'kr:6463164203'), ('appstore', 'us:941438829'), ('appstore', 'kr:6448556170'), ('appstore', 'us:6754837598'), ('appstore', 'us:941438829'), ('appstore', 'us:1239908329'), ('appstore', 'us:651636273'), ('appstore', 'us:822797943'), ('appstore', 'us:6739429409'), ('appstore', 'us:1586861768'), ('appstore', 'us:561683423'), ('appstore', 'kr:1632867925'), ('appstore', 'us:444908810'), ('appstore', 'us:561683423'), ('appstore', 'kr:6463116243'), ('appstore', 'kr:6463164203'), ('appstore', 'us:1421097870'), ('appstore', 'us:1114709439'), ('appstore', 'us:1239908329'), ('appstore', 'kr:1409785530'), ('appstore', 'us:1448204455'), ('appstore', 'kr:1231325957'), ('appstore', 'us:1421097870'), ('appstore', 'us:6747801435')) v(s, a)
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
  ('appstore', 'in:1094699978', '2:in|zoho-salesiq', 'us:1094699978'),  -- 요청당 새 글 10
  ('appstore', 'sg:910768078', '2:sg|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 10
  ('appstore', 'au:6463116243', '5:au|quillbot', 'kr:6463116243'),  -- 요청당 새 글 9
  ('appstore', 'au:6754837598', '1:au|bluedot', 'us:6754837598'),  -- 요청당 새 글 9
  ('appstore', 'ca:1459654107', '2:ca|covve', 'us:1459654107'),  -- 요청당 새 글 9
  ('appstore', 'ca:953610296', '2:ca|map-my-customers', 'us:953610296'),  -- 요청당 새 글 9
  ('appstore', 'gb:1448204455', '3:gb|flyer-maker-banner-ads-maker', 'us:1448204455'),  -- 요청당 새 글 9
  ('appstore', 'gb:337938121', '2:gb|nutshell', 'us:337938121'),  -- 요청당 새 글 9
  ('appstore', 'gb:941438829', '2:gb|copper', 'us:941438829'),  -- 요청당 새 글 9
  ('appstore', 'in:6740024098', '3:in|pollo-ai-ai-video-image', 'us:6740024098'),  -- 요청당 새 글 9
  ('appstore', 'nz:698070860', '5:nz|polaris-office-ai', 'kr:698070860'),  -- 요청당 새 글 9
  ('appstore', 'za:6450364080', '1:za|plaud', 'us:6450364080'),  -- 요청당 새 글 9
  ('appstore', 'au:587244049', '4:au|bamboohr', 'us:587244049'),  -- 요청당 새 글 8
  ('appstore', 'au:6463164203', '1:au|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 8
  ('appstore', 'au:941438829', '2:au|copper', 'us:941438829'),  -- 요청당 새 글 8
  ('appstore', 'ca:6448556170', '5:ca|wrtn', 'kr:6448556170'),  -- 요청당 새 글 8
  ('appstore', 'ca:6754837598', '1:ca|bluedot', 'us:6754837598'),  -- 요청당 새 글 8
  ('appstore', 'ca:941438829', '2:ca|copper', 'us:941438829'),  -- 요청당 새 글 8
  ('appstore', 'gb:1239908329', '2:gb|activecampaign', 'us:1239908329'),  -- 요청당 새 글 8
  ('appstore', 'gb:651636273', '2:gb|nimble', 'us:651636273'),  -- 요청당 새 글 8
  ('appstore', 'ie:822797943', '5:ie|ginger', 'us:822797943'),  -- 요청당 새 글 8
  ('appstore', 'in:6739429409', '1:in|granola', 'us:6739429409'),  -- 요청당 새 글 8
  ('appstore', 'nz:1586861768', '3:nz|zeely-ai-marketing-platform', 'us:1586861768'),  -- 요청당 새 글 8
  ('appstore', 'sg:561683423', '2:sg|bitrix24', 'us:561683423'),  -- 요청당 새 글 8
  ('appstore', 'us:1632867925', '1:us|daglo', 'kr:1632867925'),  -- 요청당 새 글 8
  ('appstore', 'za:444908810', '2:za|zoho-crm', 'us:444908810'),  -- 요청당 새 글 8
  ('appstore', 'za:561683423', '2:za|bitrix24', 'us:561683423'),  -- 요청당 새 글 8
  ('appstore', 'za:6463116243', '5:za|quillbot', 'kr:6463116243'),  -- 요청당 새 글 8
  ('appstore', 'za:6463164203', '1:za|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 8
  ('appstore', 'au:1421097870', '2:au|keap', 'us:1421097870'),  -- 요청당 새 글 7
  ('appstore', 'ca:1114709439', '2:ca|salesmate', 'us:1114709439'),  -- 요청당 새 글 7
  ('appstore', 'ca:1239908329', '2:ca|activecampaign', 'us:1239908329'),  -- 요청당 새 글 7
  ('appstore', 'ca:1409785530', '4:ca|lattice', 'kr:1409785530'),  -- 요청당 새 글 7
  ('appstore', 'ca:1448204455', '3:ca|flyer-maker-banner-ads-maker', 'us:1448204455'),  -- 요청당 새 글 7
  ('appstore', 'gb:1231325957', '4:gb|rippling', 'kr:1231325957'),  -- 요청당 새 글 7
  ('appstore', 'gb:1421097870', '2:gb|keap', 'us:1421097870'),  -- 요청당 새 글 7
  ('appstore', 'gb:6747801435', '1:gb|jamie', 'us:6747801435')  -- 요청당 새 글 7
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
  IF ins > 37 THEN RAISE EXCEPTION '삽입 %행 > 후보 37행', ins; END IF;
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
  RAISE NOTICE 'window targets: 삽입 %행(후보 37) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (('appstore', 'in:1094699978'), ('appstore', 'sg:910768078'), ('appstore', 'au:6463116243'), ('appstore', 'au:6754837598'), ('appstore', 'ca:1459654107'), ('appstore', 'ca:953610296'), ('appstore', 'gb:1448204455'), ('appstore', 'gb:337938121'), ('appstore', 'gb:941438829'), ('appstore', 'in:6740024098'), ('appstore', 'nz:698070860'), ('appstore', 'za:6450364080'), ('appstore', 'au:587244049'), ('appstore', 'au:6463164203'), ('appstore', 'au:941438829'), ('appstore', 'ca:6448556170'), ('appstore', 'ca:6754837598'), ('appstore', 'ca:941438829'), ('appstore', 'gb:1239908329'), ('appstore', 'gb:651636273'), ('appstore', 'ie:822797943'), ('appstore', 'in:6739429409'), ('appstore', 'nz:1586861768'), ('appstore', 'sg:561683423'), ('appstore', 'us:1632867925'), ('appstore', 'za:444908810'), ('appstore', 'za:561683423'), ('appstore', 'za:6463116243'), ('appstore', 'za:6463164203'), ('appstore', 'au:1421097870'), ('appstore', 'ca:1114709439'), ('appstore', 'ca:1239908329'), ('appstore', 'ca:1409785530'), ('appstore', 'ca:1448204455'), ('appstore', 'gb:1231325957'), ('appstore', 'gb:1421097870'), ('appstore', 'gb:6747801435'));   -- 기대 37행 active
