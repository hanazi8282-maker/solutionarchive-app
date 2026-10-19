-- ============================================================
-- 20261019T001625_window_targets_20261019
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 reports/2026-10-19/window-probe.json 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets 54행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
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
-- 롤백: window-discovery-rollback-20261019T001625.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ('appstore', 'us:404249815'), ('appstore', 'us:921456160'), ('appstore', 'us:404249815'), ('appstore', 'us:921456160'), ('appstore', 'us:404249815'), ('appstore', 'kr:910768078'), ('appstore', 'us:921456160'), ('appstore', 'kr:316800034'), ('appstore', 'kr:341249709'), ('appstore', 'us:404249815'), ('appstore', 'us:6471394316'), ('appstore', 'kr:698070860'), ('appstore', 'us:822797943'), ('appstore', 'us:964397083'), ('appstore', 'kr:1158877342'), ('appstore', 'au:341249709'), ('appstore', 'kr:1158877342'), ('appstore', 'us:1232780281'), ('appstore', 'kr:316800034'), ('appstore', 'kr:341249709'), ('appstore', 'us:6471394316'), ('appstore', 'kr:1276437113'), ('appstore', 'kr:316800034'), ('appstore', 'kr:341249709'), ('appstore', 'kr:698070860'), ('appstore', 'kr:1158877342'), ('appstore', 'us:1232780281'), ('appstore', 'au:341249709'), ('appstore', 'us:6471394316'), ('appstore', 'au:897446215'), ('appstore', 'us:964397083'), ('appstore', 'kr:910768078'), ('appstore', 'kr:598332111'), ('appstore', 'us:6471394316'), ('appstore', 'kr:910768078'), ('appstore', 'us:6740024098'), ('appstore', 'kr:6463116243'), ('appstore', 'us:1435480281'), ('appstore', 'kr:910768078'), ('appstore', 'kr:1276437113'), ('appstore', 'kr:6478083155'), ('appstore', 'us:404249815'), ('appstore', 'us:1021338425'), ('appstore', 'us:1030906799'), ('appstore', 'us:6471394316'), ('appstore', 'us:1030906799'), ('appstore', 'us:1232780281'), ('appstore', 'kr:598332111'), ('appstore', 'kr:698070860'), ('appstore', 'us:1232780281'), ('appstore', 'kr:1276437113'), ('appstore', 'us:1435480281'), ('appstore', 'us:404249815'), ('appstore', 'kr:1276437113')) v(s, a)
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
  ('appstore', 'au:404249815', '2:au|salesforce', 'us:404249815'),  -- 요청당 새 글 50
  ('appstore', 'au:921456160', '2:au|pipedrive', 'us:921456160'),  -- 요청당 새 글 50
  ('appstore', 'ca:404249815', '2:ca|salesforce', 'us:404249815'),  -- 요청당 새 글 50
  ('appstore', 'ca:921456160', '2:ca|pipedrive', 'us:921456160'),  -- 요청당 새 글 50
  ('appstore', 'gb:404249815', '2:gb|salesforce', 'us:404249815'),  -- 요청당 새 글 50
  ('appstore', 'gb:910768078', '2:gb|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 50
  ('appstore', 'gb:921456160', '2:gb|pipedrive', 'us:921456160'),  -- 요청당 새 글 50
  ('appstore', 'in:316800034', '4:in|workday', 'kr:316800034'),  -- 요청당 새 글 50
  ('appstore', 'in:341249709', '3:in|hootsuite-owlywriter', 'kr:341249709'),  -- 요청당 새 글 50
  ('appstore', 'in:404249815', '2:in|salesforce', 'us:404249815'),  -- 요청당 새 글 50
  ('appstore', 'in:6471394316', '3:in|invideo-ai-video-editor', 'us:6471394316'),  -- 요청당 새 글 50
  ('appstore', 'in:698070860', '5:in|polaris-office-ai', 'kr:698070860'),  -- 요청당 새 글 50
  ('appstore', 'in:822797943', '5:in|ginger', 'us:822797943'),  -- 요청당 새 글 50
  ('appstore', 'in:964397083', '3:in|meta-ads-manager', 'us:964397083'),  -- 요청당 새 글 50
  ('appstore', 'nz:1158877342', '5:nz|grammarly', 'kr:1158877342'),  -- 요청당 새 글 50
  ('appstore', 'nz:341249709', '3:nz|hootsuite-owlywriter', 'au:341249709'),  -- 요청당 새 글 50
  ('appstore', 'sg:1158877342', '5:sg|grammarly', 'kr:1158877342'),  -- 요청당 새 글 50
  ('appstore', 'sg:1232780281', '5:sg|notion-ai', 'us:1232780281'),  -- 요청당 새 글 50
  ('appstore', 'sg:316800034', '4:sg|workday', 'kr:316800034'),  -- 요청당 새 글 50
  ('appstore', 'sg:341249709', '3:sg|hootsuite-owlywriter', 'kr:341249709'),  -- 요청당 새 글 50
  ('appstore', 'sg:6471394316', '3:sg|invideo-ai-video-editor', 'us:6471394316'),  -- 요청당 새 글 50
  ('appstore', 'us:1276437113', '1:us|otter-ai', 'kr:1276437113'),  -- 요청당 새 글 50
  ('appstore', 'us:316800034', '4:us|workday', 'kr:316800034'),  -- 요청당 새 글 50
  ('appstore', 'us:341249709', '3:us|hootsuite-owlywriter', 'kr:341249709'),  -- 요청당 새 글 50
  ('appstore', 'us:698070860', '5:us|polaris-office-ai', 'kr:698070860'),  -- 요청당 새 글 50
  ('appstore', 'za:1158877342', '5:za|grammarly', 'kr:1158877342'),  -- 요청당 새 글 50
  ('appstore', 'za:1232780281', '5:za|notion-ai', 'us:1232780281'),  -- 요청당 새 글 50
  ('appstore', 'za:341249709', '3:za|hootsuite-owlywriter', 'au:341249709'),  -- 요청당 새 글 50
  ('appstore', 'za:6471394316', '3:za|invideo-ai-video-editor', 'us:6471394316'),  -- 요청당 새 글 50
  ('appstore', 'za:897446215', '3:za|canva', 'au:897446215'),  -- 요청당 새 글 50
  ('appstore', 'za:964397083', '3:za|meta-ads-manager', 'us:964397083'),  -- 요청당 새 글 50
  ('appstore', 'au:910768078', '2:au|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 47
  ('appstore', 'gb:598332111', '1:gb|rev', 'kr:598332111'),  -- 요청당 새 글 45
  ('appstore', 'ie:6471394316', '3:ie|invideo-ai-video-editor', 'us:6471394316'),  -- 요청당 새 글 45
  ('appstore', 'ca:910768078', '2:ca|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 43
  ('appstore', 'ca:6740024098', '3:ca|pollo-ai-ai-video-image', 'us:6740024098'),  -- 요청당 새 글 42
  ('appstore', 'in:6463116243', '5:in|quillbot', 'kr:6463116243'),  -- 요청당 새 글 42
  ('appstore', 'au:1435480281', '3:au|boosted-ad-maker-by-lightricks', 'us:1435480281'),  -- 요청당 새 글 41
  ('appstore', 'in:910768078', '2:in|linkedin-sales-navigator', 'kr:910768078'),  -- 요청당 새 글 40
  ('appstore', 'za:1276437113', '1:za|otter-ai', 'kr:1276437113'),  -- 요청당 새 글 40
  ('appstore', 'gb:6478083155', '4:gb|deel', 'kr:6478083155'),  -- 요청당 새 글 39
  ('appstore', 'sg:404249815', '2:sg|salesforce', 'us:404249815'),  -- 요청당 새 글 39
  ('appstore', 'au:1021338425', '2:au|aircall', 'us:1021338425'),  -- 요청당 새 글 37
  ('appstore', 'ie:1030906799', '3:ie|ripl-social-media-marketing', 'us:1030906799'),  -- 요청당 새 글 36
  ('appstore', 'nz:6471394316', '3:nz|invideo-ai-video-editor', 'us:6471394316'),  -- 요청당 새 글 36
  ('appstore', 'nz:1030906799', '3:nz|ripl-social-media-marketing', 'us:1030906799'),  -- 요청당 새 글 35
  ('appstore', 'nz:1232780281', '5:nz|notion-ai', 'us:1232780281'),  -- 요청당 새 글 35
  ('appstore', 'au:598332111', '1:au|rev', 'kr:598332111'),  -- 요청당 새 글 33
  ('appstore', 'za:698070860', '5:za|polaris-office-ai', 'kr:698070860'),  -- 요청당 새 글 33
  ('appstore', 'ie:1232780281', '5:ie|notion-ai', 'us:1232780281'),  -- 요청당 새 글 32
  ('appstore', 'sg:1276437113', '1:sg|otter-ai', 'kr:1276437113'),  -- 요청당 새 글 32
  ('appstore', 'za:1435480281', '3:za|boosted-ad-maker-by-lightricks', 'us:1435480281'),  -- 요청당 새 글 31
  ('appstore', 'ie:404249815', '2:ie|salesforce', 'us:404249815'),  -- 요청당 새 글 30
  ('appstore', 'in:1276437113', '1:in|otter-ai', 'kr:1276437113')  -- 요청당 새 글 30
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
  IF ins > 54 THEN RAISE EXCEPTION '삽입 %행 > 후보 54행', ins; END IF;
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
  RAISE NOTICE 'window targets: 삽입 %행(후보 54) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (('appstore', 'au:404249815'), ('appstore', 'au:921456160'), ('appstore', 'ca:404249815'), ('appstore', 'ca:921456160'), ('appstore', 'gb:404249815'), ('appstore', 'gb:910768078'), ('appstore', 'gb:921456160'), ('appstore', 'in:316800034'), ('appstore', 'in:341249709'), ('appstore', 'in:404249815'), ('appstore', 'in:6471394316'), ('appstore', 'in:698070860'), ('appstore', 'in:822797943'), ('appstore', 'in:964397083'), ('appstore', 'nz:1158877342'), ('appstore', 'nz:341249709'), ('appstore', 'sg:1158877342'), ('appstore', 'sg:1232780281'), ('appstore', 'sg:316800034'), ('appstore', 'sg:341249709'), ('appstore', 'sg:6471394316'), ('appstore', 'us:1276437113'), ('appstore', 'us:316800034'), ('appstore', 'us:341249709'), ('appstore', 'us:698070860'), ('appstore', 'za:1158877342'), ('appstore', 'za:1232780281'), ('appstore', 'za:341249709'), ('appstore', 'za:6471394316'), ('appstore', 'za:897446215'), ('appstore', 'za:964397083'), ('appstore', 'au:910768078'), ('appstore', 'gb:598332111'), ('appstore', 'ie:6471394316'), ('appstore', 'ca:910768078'), ('appstore', 'ca:6740024098'), ('appstore', 'in:6463116243'), ('appstore', 'au:1435480281'), ('appstore', 'in:910768078'), ('appstore', 'za:1276437113'), ('appstore', 'gb:6478083155'), ('appstore', 'sg:404249815'), ('appstore', 'au:1021338425'), ('appstore', 'ie:1030906799'), ('appstore', 'nz:6471394316'), ('appstore', 'nz:1030906799'), ('appstore', 'nz:1232780281'), ('appstore', 'au:598332111'), ('appstore', 'za:698070860'), ('appstore', 'ie:1232780281'), ('appstore', 'sg:1276437113'), ('appstore', 'za:1435480281'), ('appstore', 'ie:404249815'), ('appstore', 'in:1276437113'));   -- 기대 54행 active
