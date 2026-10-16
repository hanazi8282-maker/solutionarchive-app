-- ============================================================
-- 20261017000020_window_targets_20261017
--
-- ⛔ 미적용 초안(v71ab C-2 재작업 → v71ad §2 재배분). 적용은 CEO-staff 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- ★ 적용 순서: 20261017000010_sales_appstore_targets_20261017(PR #559, ② 영업 앱) → 이 파일. 파일 번호도 그 순서다.
--   이 파일의 N 은 적용 시점에 다시 세므로 #559 가 먼저 쓴 칸을 빼고 **남은 칸만** 쓴다 — 게이트를 못 넘는다.
--   #559 를 적용하지 않기로 했으면 이 파일만 적용해도 된다(그 경우 NOTICE 한 줄).
--
-- 무엇을: reports/window-adopted.json pending 106건(앱스토어 mostRecent) 중 **30% 게이트가 허용하는 만큼만**,
--   **영역 우선순위 ② > ⑤ > ④ > ③**(label 첫 ':' 앞, 그 밖 영역은 맨 뒤) 먼저, 같은 영역 안에서는
--   요청당 새 글(new_per_request, 프로브 실측 기대수확) 높은 순으로 상위 N행을 review_targets 에 INSERT.
--   (v71ab 원안은 기대수확 순만이라 ② 8행이 전부 밀려 0행이었다 — v71ad 남헌 ② 최우선 보강 지시로 바꿨다.)
--   나머지는 넣지 않는다(대장에서 pending 그대로 — 다음 분할 때 같은 파일 형식으로 다시 만든다).
--   N 은 이 파일 안에서 적용 시점 수치로 계산한다(하드코딩 없음):
--     as = 앱스토어 활성, total = enabled 소스 활성 전체, 게이트 = 넣은 뒤 as' ≤ 0.3 × total'
--     (as + N) ≤ 0.3 × (total + N)  ⇔  N ≤ (0.3 × total − as) / 0.7   → N = floor(그 값), 0 미만이면 0
--     예: total 110 · as 0 → N = floor(33/0.7) = 47.
--   동률(같은 영역·같은 new_per_request)은 product_ref 순으로 끊는다(결정적).
-- 넣은 행 id 는 public.review_targets_window_batch_20261017 에 남긴다 — 롤백은 이 표만 본다(같은 라벨을 나중에 nightly 가 넣어도 안 건드린다).
--   ⚠️ 새 테이블 1개(기록용, RLS on·정책 0 = service_role 전용, 20260930000006 과 같은 방식). 롤백 후 지워도 된다.
-- project_id 는 앵커(같은 source_key 의 기존 타깃 anchor_ref)에서 읽는다. 앵커 0행이면 RAISE, 2행 이상이면 21000.
-- status='active' · last_run_at NULL(미방문 우선) · 카운터는 기본값. review_sources·review_source_ramp 는 손대지 않는다.
-- 사후 가드(어긋나면 RAISE → 전체 롤백): 삽입 > N · 앱스토어 활성 > 0.3 × 전체 활성 · googleplay 활성 증가.
-- 롤백: 20261017000020_window_targets_20261017_rollback.sql
-- 확인 쿼리: reports/2026-10-17/window-batch-checks.sql
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _wt_new (
  source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, anchor_ref text NOT NULL,
  new_per_request numeric NOT NULL, project_id uuid,
  PRIMARY KEY (source_key, product_ref)
) ON COMMIT DROP;
INSERT INTO _wt_new (source_key, product_ref, label, anchor_ref, new_per_request) VALUES
  ('appstore', 'gb:964397083', '3:gb|meta-ads-manager', 'us:964397083', 50),
  ('appstore', 'in:964397083', '3:in|meta-ads-manager', 'us:964397083', 50),
  ('appstore', 'za:964397083', '3:za|meta-ads-manager', 'us:964397083', 50),
  ('appstore', 'gb:1435480281', '3:gb|boosted-ad-maker-by-lightricks', 'us:1435480281', 50),
  ('appstore', 'in:1435480281', '3:in|boosted-ad-maker-by-lightricks', 'us:1435480281', 50),
  ('appstore', 'za:897446215', '3:za|canva', 'au:897446215', 50),
  ('appstore', 'gb:1586861768', '3:gb|zeely-ai-marketing-platform', 'us:1586861768', 50),
  ('appstore', 'us:698070860', '5:us|polaris-office-ai', 'kr:698070860', 50),
  ('appstore', 'gb:698070860', '5:gb|polaris-office-ai', 'kr:698070860', 50),
  ('appstore', 'ca:698070860', '5:ca|polaris-office-ai', 'kr:698070860', 50),
  ('appstore', 'in:698070860', '5:in|polaris-office-ai', 'kr:698070860', 50),
  ('appstore', 'gb:1037457231', '3:gb|google-ads', 'us:1037457231', 50),
  ('appstore', 'in:1037457231', '3:in|google-ads', 'us:1037457231', 50),
  ('appstore', 'gb:1158877342', '5:gb|grammarly', 'kr:1158877342', 50),
  ('appstore', 'in:1158877342', '5:in|grammarly', 'kr:1158877342', 50),
  ('appstore', 'sg:1158877342', '5:sg|grammarly', 'kr:1158877342', 50),
  ('appstore', 'ie:1158877342', '5:ie|grammarly', 'kr:1158877342', 50),
  ('appstore', 'nz:1158877342', '5:nz|grammarly', 'kr:1158877342', 50),
  ('appstore', 'za:1158877342', '5:za|grammarly', 'kr:1158877342', 50),
  ('appstore', 'gb:1232780281', '5:gb|notion-ai', 'us:1232780281', 50),
  ('appstore', 'in:1232780281', '5:in|notion-ai', 'us:1232780281', 50),
  ('appstore', 'sg:1232780281', '5:sg|notion-ai', 'us:1232780281', 50),
  ('appstore', 'za:1232780281', '5:za|notion-ai', 'us:1232780281', 50),
  ('appstore', 'gb:1030906799', '3:gb|ripl-social-media-marketing', 'us:1030906799', 50),
  ('appstore', 'gb:6471394316', '3:gb|invideo-ai-video-editor', 'us:6471394316', 50),
  ('appstore', 'ca:6471394316', '3:ca|invideo-ai-video-editor', 'us:6471394316', 50),
  ('appstore', 'in:6471394316', '3:in|invideo-ai-video-editor', 'us:6471394316', 50),
  ('appstore', 'sg:6471394316', '3:sg|invideo-ai-video-editor', 'us:6471394316', 50),
  ('appstore', 'za:6471394316', '3:za|invideo-ai-video-editor', 'us:6471394316', 50),
  ('appstore', 'gb:6740024098', '3:gb|pollo-ai-ai-video-image', 'us:6740024098', 50),
  ('appstore', 'us:341249709', '3:us|hootsuite-owlywriter', 'kr:341249709', 50),
  ('appstore', 'gb:341249709', '3:gb|hootsuite-owlywriter', 'kr:341249709', 50),
  ('appstore', 'in:341249709', '3:in|hootsuite-owlywriter', 'kr:341249709', 50),
  ('appstore', 'sg:341249709', '3:sg|hootsuite-owlywriter', 'kr:341249709', 50),
  ('appstore', 'ie:341249709', '3:ie|hootsuite-owlywriter', 'kr:341249709', 50),
  ('appstore', 'nz:341249709', '3:nz|hootsuite-owlywriter', 'au:341249709', 50),
  ('appstore', 'za:341249709', '3:za|hootsuite-owlywriter', 'au:341249709', 50),
  ('appstore', 'gb:822797943', '5:gb|ginger', 'us:822797943', 50),
  ('appstore', 'ca:822797943', '5:ca|ginger', 'us:822797943', 50),
  ('appstore', 'in:822797943', '5:in|ginger', 'us:822797943', 50),
  ('appstore', 'gb:1487937127', '5:gb|craft-docs', 'kr:1487937127', 50),
  ('appstore', 'in:1487937127', '5:in|craft-docs', 'kr:1487937127', 50),
  ('appstore', 'us:6478083155', '4:us|deel', 'kr:6478083155', 50),
  ('appstore', 'ie:6471394316', '3:ie|invideo-ai-video-editor', 'us:6471394316', 45),
  ('appstore', 'ca:6740024098', '3:ca|pollo-ai-ai-video-image', 'us:6740024098', 42),
  ('appstore', 'in:6463116243', '5:in|quillbot', 'kr:6463116243', 42),
  ('appstore', 'au:1435480281', '3:au|boosted-ad-maker-by-lightricks', 'us:1435480281', 41),
  ('appstore', 'gb:6478083155', '4:gb|deel', 'kr:6478083155', 39),
  ('appstore', 'ie:1030906799', '3:ie|ripl-social-media-marketing', 'us:1030906799', 36),
  ('appstore', 'nz:6471394316', '3:nz|invideo-ai-video-editor', 'us:6471394316', 36),
  ('appstore', 'nz:1232780281', '5:nz|notion-ai', 'us:1232780281', 35),
  ('appstore', 'nz:1030906799', '3:nz|ripl-social-media-marketing', 'us:1030906799', 35),
  ('appstore', 'za:698070860', '5:za|polaris-office-ai', 'kr:698070860', 33),
  ('appstore', 'ie:1232780281', '5:ie|notion-ai', 'us:1232780281', 32),
  ('appstore', 'za:1435480281', '3:za|boosted-ad-maker-by-lightricks', 'us:1435480281', 31),
  ('appstore', 'za:1030906799', '3:za|ripl-social-media-marketing', 'us:1030906799', 30),
  ('appstore', 'za:1586861768', '3:za|zeely-ai-marketing-platform', 'us:1586861768', 29),
  ('appstore', 'sg:698070860', '5:sg|polaris-office-ai', 'kr:698070860', 27),
  ('appstore', 'au:6740024098', '3:au|pollo-ai-ai-video-image', 'us:6740024098', 26),
  ('appstore', 'in:1030906799', '3:in|ripl-social-media-marketing', 'us:1030906799', 25),
  ('appstore', 'nz:964397083', '3:nz|meta-ads-manager', 'us:964397083', 24),
  ('appstore', 'us:1511861727', '3:us|triple-whale', 'kr:1511861727', 23),
  ('appstore', 'gb:6463116243', '5:gb|quillbot', 'kr:6463116243', 23),
  ('appstore', 'in:1107711722', '2:in|hubspot-sales-hub', 'kr:1107711722', 20),
  ('appstore', 'ie:964397083', '3:ie|meta-ads-manager', 'us:964397083', 19),
  ('appstore', 'ca:6478083155', '4:ca|deel', 'kr:6478083155', 19),
  ('appstore', 'sg:1487937127', '5:sg|craft-docs', 'kr:1487937127', 17),
  ('appstore', 'za:1487937127', '5:za|craft-docs', 'kr:1487937127', 16),
  ('appstore', 'gb:1628773284', '5:gb|wordtune', 'us:1628773284', 15),
  ('appstore', 'za:1037457231', '3:za|google-ads', 'us:1037457231', 15),
  ('appstore', 'ca:6463116243', '5:ca|quillbot', 'kr:6463116243', 14),
  ('appstore', 'in:6478083155', '4:in|deel', 'kr:6478083155', 14),
  ('appstore', 'sg:1586861768', '3:sg|zeely-ai-marketing-platform', 'us:1586861768', 13),
  ('appstore', 'sg:822797943', '5:sg|ginger', 'us:822797943', 13),
  ('appstore', 'us:6448556170', '5:us|wrtn', 'kr:6448556170', 12),
  ('appstore', 'sg:1435480281', '3:sg|boosted-ad-maker-by-lightricks', 'us:1435480281', 11),
  ('appstore', 'sg:1037457231', '3:sg|google-ads', 'us:1037457231', 11),
  ('appstore', 'au:6478083155', '4:au|deel', 'kr:6478083155', 10),
  ('appstore', 'nz:1107711722', '2:nz|hubspot-sales-hub', 'kr:1107711722', 9),
  ('appstore', 'gb:1448204455', '3:gb|flyer-maker-banner-ads-maker', 'us:1448204455', 9),
  ('appstore', 'nz:698070860', '5:nz|polaris-office-ai', 'kr:698070860', 9),
  ('appstore', 'in:6740024098', '3:in|pollo-ai-ai-video-image', 'us:6740024098', 9),
  ('appstore', 'au:6463116243', '5:au|quillbot', 'kr:6463116243', 9),
  ('appstore', 'sg:1107711722', '2:sg|hubspot-sales-hub', 'kr:1107711722', 8),
  ('appstore', 'nz:1586861768', '3:nz|zeely-ai-marketing-platform', 'us:1586861768', 8),
  ('appstore', 'za:6463116243', '5:za|quillbot', 'kr:6463116243', 8),
  ('appstore', 'ie:822797943', '5:ie|ginger', 'us:822797943', 8),
  ('appstore', 'ca:6448556170', '5:ca|wrtn', 'kr:6448556170', 8),
  ('appstore', 'ca:1289289459', '2:ca|gong', 'kr:1289289459', 7),
  ('appstore', 'ie:1435480281', '3:ie|boosted-ad-maker-by-lightricks', 'us:1435480281', 7),
  ('appstore', 'nz:1435480281', '3:nz|boosted-ad-maker-by-lightricks', 'us:1435480281', 7),
  ('appstore', 'ca:1448204455', '3:ca|flyer-maker-banner-ads-maker', 'us:1448204455', 7),
  ('appstore', 'ie:1487937127', '5:ie|craft-docs', 'kr:1487937127', 7),
  ('appstore', 'ca:1493170277', '2:ca|zoominfo', 'us:1493170277', 6),
  ('appstore', 'gb:977304452', '2:gb|clari', 'us:977304452', 6),
  ('appstore', 'za:1448204455', '3:za|flyer-maker-banner-ads-maker', 'us:1448204455', 6),
  ('appstore', 'sg:1030906799', '3:sg|ripl-social-media-marketing', 'us:1030906799', 6),
  ('appstore', 'nz:1487937127', '5:nz|craft-docs', 'kr:1487937127', 6),
  ('appstore', 'gb:6740884542', '5:gb|sudowrite', 'us:6740884542', 6),
  ('appstore', 'ca:6740884542', '5:ca|sudowrite', 'us:6740884542', 6),
  ('appstore', 'ie:1107711722', '2:ie|hubspot-sales-hub', 'kr:1107711722', 5),
  ('appstore', 'ca:6474658497', '2:ca|instantly', 'us:6474658497', 5),
  ('appstore', 'gb:6751626758', '3:gb|ai-product-video-ad-pixury', 'us:6751626758', 5),
  ('appstore', 'au:6751626758', '3:au|ai-product-video-ad-pixury', 'us:6751626758', 5),
  ('appstore', 'in:6751626758', '3:in|ai-product-video-ad-pixury', 'us:6751626758', 5),
  ('appstore', 'za:6751626758', '3:za|ai-product-video-ad-pixury', 'us:6751626758', 5)
;

UPDATE _wt_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = n.source_key AND k.product_ref = n.anchor_ref);

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
  IF to_regclass('public.review_targets_sales_batch_20261017') IS NULL THEN
    RAISE NOTICE '영업 마이그(20261017000010, PR #559) 미적용 — 그 마이그가 쓸 ② 칸까지 이 파일이 쓴다. 의도한 것이 아니면 ROLLBACK 하고 순서대로';
  END IF;
END $$;

-- 게이트 허용 N(적용 시점 실측). 이미 있는 (source_key, product_ref) 는 순위에서 뺀다.
CREATE TEMP TABLE _wt_gate ON COMMIT DROP AS
SELECT a.as_active, a.total_active, a.gp_active,
       GREATEST(0, floor((0.3 * a.total_active - a.as_active) / 0.7))::int AS n_allowed
  FROM (SELECT count(*) FILTER (WHERE t.source_key = 'appstore')::int AS as_active,
               count(*)::int AS total_active,
               count(*) FILTER (WHERE t.source_key = 'googleplay')::int AS gp_active
          FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
         WHERE t.status = 'active') a;

CREATE TEMP TABLE _wt_pick ON COMMIT DROP AS
SELECT n.* FROM (
  SELECT n.*, row_number() OVER (
           ORDER BY CASE split_part(n.label, ':', 1) WHEN '2' THEN 1 WHEN '5' THEN 2 WHEN '4' THEN 3 WHEN '3' THEN 4 ELSE 5 END,
                    n.new_per_request DESC, n.product_ref) AS rk
    FROM _wt_new n
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)
) n, _wt_gate g
WHERE n.rk <= g.n_allowed;

CREATE TABLE IF NOT EXISTS public.review_targets_window_batch_20261017 (
  target_id uuid PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE,
  source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL,
  new_per_request numeric NOT NULL, inserted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_targets_window_batch_20261017 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.review_targets_window_batch_20261017 IS
  '20261017000020_window_targets_20261017 이 넣은 창문 타깃 목록(게이트 한도 상위 N). 롤백이 이걸 읽는다. 롤백 후에는 지워도 된다.';

WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT p.project_id, p.source_key, p.product_ref, p.label, 'active', NULL, NULL
    FROM _wt_pick p
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key, product_ref, label
)
INSERT INTO public.review_targets_window_batch_20261017 (target_id, source_key, product_ref, label, new_per_request)
SELECT i.id, i.source_key, i.product_ref, i.label, p.new_per_request
  FROM ins i JOIN _wt_pick p USING (source_key, product_ref);

DO $$
DECLARE ins int; n_allowed int; gp_before int; gp_after int; as_active int; total_active int; by_area text;
BEGIN
  SELECT count(*) INTO ins FROM public.review_targets_window_batch_20261017 WHERE inserted_at = now();
  SELECT g.n_allowed, g.gp_active INTO n_allowed, gp_before FROM _wt_gate g;
  IF ins > n_allowed THEN RAISE EXCEPTION '삽입 %행 > 게이트 허용 %행', ins, n_allowed; END IF;
  SELECT count(*) INTO gp_after FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF gp_after > gp_before THEN RAISE EXCEPTION '구글 플레이 활성 % → % (이 마이그는 앱스토어만 넣는다)', gp_before, gp_after; END IF;
  SELECT count(*) FILTER (WHERE t.source_key = 'appstore'), count(*) INTO as_active, total_active
    FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled WHERE t.status = 'active';
  IF ins > 0 AND as_active > 0.3 * total_active THEN
    RAISE EXCEPTION '앱스토어 활성 %/% > 0.3', as_active, total_active;
  END IF;
  SELECT string_agg(a || '=' || c, ' · ' ORDER BY a) INTO by_area
    FROM (SELECT split_part(label, ':', 1) AS a, count(*) AS c FROM public.review_targets_window_batch_20261017 WHERE inserted_at = now() GROUP BY 1) x;
  RAISE NOTICE 'window batch: 삽입 %행(게이트 허용 %, 후보 106) · 영역 % · appstore 활성 %/%', ins, n_allowed, coalesce(by_area, '-'), as_active, total_active;
END $$;

COMMIT;
