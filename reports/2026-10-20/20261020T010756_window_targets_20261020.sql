-- ============================================================
-- 20261020T010756_window_targets_20261020
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 reports/2026-10-20/window-probe.json 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets 47행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
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
-- 롤백: window-discovery-rollback-20261020T010756.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ('appstore', 'us:444908810'), ('appstore', 'us:6450364080'), ('appstore', 'us:444908810'), ('appstore', 'us:6450364080'), ('appstore', 'us:444908810'), ('appstore', 'kr:1480649572'), ('appstore', 'us:444908810'), ('appstore', 'us:563017797'), ('appstore', 'us:6739429409'), ('appstore', 'us:6450364080'), ('appstore', 'us:1030906799'), ('appstore', 'kr:1480649572'), ('appstore', 'us:1021338425'), ('appstore', 'kr:1276437113'), ('appstore', 'us:1586861768'), ('appstore', 'kr:316800034'), ('appstore', 'us:563017797'), ('appstore', 'kr:698070860'), ('appstore', 'us:6740024098'), ('appstore', 'kr:1470197212'), ('appstore', 'kr:1231325957'), ('appstore', 'us:6739429409'), ('appstore', 'us:1030906799'), ('appstore', 'kr:316800034'), ('appstore', 'us:1021338425'), ('appstore', 'us:964397083'), ('appstore', 'us:404249815'), ('appstore', 'kr:598332111'), ('appstore', 'kr:6463116243'), ('appstore', 'kr:1511861727'), ('appstore', 'us:563017797'), ('appstore', 'kr:1480649572'), ('appstore', 'kr:316800034'), ('appstore', 'kr:6478083155'), ('appstore', 'us:879884387'), ('appstore', 'us:964397083'), ('appstore', 'kr:1480649572'), ('appstore', 'kr:1487937127'), ('appstore', 'us:6739429409'), ('appstore', 'kr:1470197212'), ('appstore', 'kr:1477264742'), ('appstore', 'kr:1487937127'), ('appstore', 'us:1628773284'), ('appstore', 'kr:6463164203'), ('appstore', 'us:6754837598'), ('appstore', 'us:692777054'), ('appstore', 'us:921456160')) v(s, a)
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
  ('appstore', 'ca:444908810', '2:ca|zoho-crm', 'us:444908810'),  -- 요청당 새 글 50
  ('appstore', 'ca:6450364080', '1:ca|plaud', 'us:6450364080'),  -- 요청당 새 글 50
  ('appstore', 'gb:444908810', '2:gb|zoho-crm', 'us:444908810'),  -- 요청당 새 글 50
  ('appstore', 'gb:6450364080', '1:gb|plaud', 'us:6450364080'),  -- 요청당 새 글 50
  ('appstore', 'in:444908810', '2:in|zoho-crm', 'us:444908810'),  -- 요청당 새 글 45
  ('appstore', 'gb:1480649572', '1:gb|notta', 'kr:1480649572'),  -- 요청당 새 글 43
  ('appstore', 'au:444908810', '2:au|zoho-crm', 'us:444908810'),  -- 요청당 새 글 34
  ('appstore', 'gb:563017797', '2:gb|insightly', 'us:563017797'),  -- 요청당 새 글 33
  ('appstore', 'gb:6739429409', '1:gb|granola', 'us:6739429409'),  -- 요청당 새 글 32
  ('appstore', 'au:6450364080', '1:au|plaud', 'us:6450364080'),  -- 요청당 새 글 31
  ('appstore', 'za:1030906799', '3:za|ripl-social-media-marketing', 'us:1030906799'),  -- 요청당 새 글 30
  ('appstore', 'ca:1480649572', '1:ca|notta', 'kr:1480649572'),  -- 요청당 새 글 29
  ('appstore', 'gb:1021338425', '2:gb|aircall', 'us:1021338425'),  -- 요청당 새 글 29
  ('appstore', 'nz:1276437113', '1:nz|otter-ai', 'kr:1276437113'),  -- 요청당 새 글 29
  ('appstore', 'za:1586861768', '3:za|zeely-ai-marketing-platform', 'us:1586861768'),  -- 요청당 새 글 29
  ('appstore', 'za:316800034', '4:za|workday', 'kr:316800034'),  -- 요청당 새 글 28
  ('appstore', 'au:563017797', '2:au|insightly', 'us:563017797'),  -- 요청당 새 글 27
  ('appstore', 'sg:698070860', '5:sg|polaris-office-ai', 'kr:698070860'),  -- 요청당 새 글 27
  ('appstore', 'au:6740024098', '3:au|pollo-ai-ai-video-image', 'us:6740024098'),  -- 요청당 새 글 26
  ('appstore', 'gb:1470197212', '4:gb|personio', 'kr:1470197212'),  -- 요청당 새 글 26
  ('appstore', 'ca:1231325957', '4:ca|rippling', 'kr:1231325957'),  -- 요청당 새 글 25
  ('appstore', 'ca:6739429409', '1:ca|granola', 'us:6739429409'),  -- 요청당 새 글 25
  ('appstore', 'in:1030906799', '3:in|ripl-social-media-marketing', 'us:1030906799'),  -- 요청당 새 글 25
  ('appstore', 'nz:316800034', '4:nz|workday', 'kr:316800034'),  -- 요청당 새 글 25
  ('appstore', 'ca:1021338425', '2:ca|aircall', 'us:1021338425'),  -- 요청당 새 글 24
  ('appstore', 'nz:964397083', '3:nz|meta-ads-manager', 'us:964397083'),  -- 요청당 새 글 24
  ('appstore', 'za:404249815', '2:za|salesforce', 'us:404249815'),  -- 요청당 새 글 24
  ('appstore', 'ca:598332111', '1:ca|rev', 'kr:598332111'),  -- 요청당 새 글 23
  ('appstore', 'gb:6463116243', '5:gb|quillbot', 'kr:6463116243'),  -- 요청당 새 글 23
  ('appstore', 'us:1511861727', '3:us|triple-whale', 'kr:1511861727'),  -- 요청당 새 글 23
  ('appstore', 'ca:563017797', '2:ca|insightly', 'us:563017797'),  -- 요청당 새 글 21
  ('appstore', 'au:1480649572', '1:au|notta', 'kr:1480649572'),  -- 요청당 새 글 20
  ('appstore', 'ie:316800034', '4:ie|workday', 'kr:316800034'),  -- 요청당 새 글 20
  ('appstore', 'ca:6478083155', '4:ca|deel', 'kr:6478083155'),  -- 요청당 새 글 19
  ('appstore', 'ca:879884387', '2:ca|salesrabbit', 'us:879884387'),  -- 요청당 새 글 19
  ('appstore', 'ie:964397083', '3:ie|meta-ads-manager', 'us:964397083'),  -- 요청당 새 글 19
  ('appstore', 'in:1480649572', '1:in|notta', 'kr:1480649572'),  -- 요청당 새 글 19
  ('appstore', 'sg:1487937127', '5:sg|craft-docs', 'kr:1487937127'),  -- 요청당 새 글 17
  ('appstore', 'au:6739429409', '1:au|granola', 'us:6739429409'),  -- 요청당 새 글 16
  ('appstore', 'us:1470197212', '4:us|personio', 'kr:1470197212'),  -- 요청당 새 글 16
  ('appstore', 'us:1477264742', '1:us|fellow', 'kr:1477264742'),  -- 요청당 새 글 16
  ('appstore', 'za:1487937127', '5:za|craft-docs', 'kr:1487937127'),  -- 요청당 새 글 16
  ('appstore', 'gb:1628773284', '5:gb|wordtune', 'us:1628773284'),  -- 요청당 새 글 15
  ('appstore', 'gb:6463164203', '1:gb|fireflies-ai', 'kr:6463164203'),  -- 요청당 새 글 15
  ('appstore', 'gb:6754837598', '1:gb|bluedot', 'us:6754837598'),  -- 요청당 새 글 15
  ('appstore', 'ie:692777054', '2:ie|onepagecrm', 'us:692777054'),  -- 요청당 새 글 15
  ('appstore', 'in:921456160', '2:in|pipedrive', 'us:921456160')  -- 요청당 새 글 15
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
  IF ins > 47 THEN RAISE EXCEPTION '삽입 %행 > 후보 47행', ins; END IF;
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
  RAISE NOTICE 'window targets: 삽입 %행(후보 47) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (('appstore', 'ca:444908810'), ('appstore', 'ca:6450364080'), ('appstore', 'gb:444908810'), ('appstore', 'gb:6450364080'), ('appstore', 'in:444908810'), ('appstore', 'gb:1480649572'), ('appstore', 'au:444908810'), ('appstore', 'gb:563017797'), ('appstore', 'gb:6739429409'), ('appstore', 'au:6450364080'), ('appstore', 'za:1030906799'), ('appstore', 'ca:1480649572'), ('appstore', 'gb:1021338425'), ('appstore', 'nz:1276437113'), ('appstore', 'za:1586861768'), ('appstore', 'za:316800034'), ('appstore', 'au:563017797'), ('appstore', 'sg:698070860'), ('appstore', 'au:6740024098'), ('appstore', 'gb:1470197212'), ('appstore', 'ca:1231325957'), ('appstore', 'ca:6739429409'), ('appstore', 'in:1030906799'), ('appstore', 'nz:316800034'), ('appstore', 'ca:1021338425'), ('appstore', 'nz:964397083'), ('appstore', 'za:404249815'), ('appstore', 'ca:598332111'), ('appstore', 'gb:6463116243'), ('appstore', 'us:1511861727'), ('appstore', 'ca:563017797'), ('appstore', 'au:1480649572'), ('appstore', 'ie:316800034'), ('appstore', 'ca:6478083155'), ('appstore', 'ca:879884387'), ('appstore', 'ie:964397083'), ('appstore', 'in:1480649572'), ('appstore', 'sg:1487937127'), ('appstore', 'au:6739429409'), ('appstore', 'us:1470197212'), ('appstore', 'us:1477264742'), ('appstore', 'za:1487937127'), ('appstore', 'gb:1628773284'), ('appstore', 'gb:6463164203'), ('appstore', 'gb:6754837598'), ('appstore', 'ie:692777054'), ('appstore', 'in:921456160'));   -- 기대 47행 active
