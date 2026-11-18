-- v71cu S6: 수확률 성적표·분야 자산·새 소스·브리핑 집계 뷰(읽기 전용, 추가 전용). 롤백: ..._rollback.sql
-- "쓸 수 있는 것" 정본(S0 Q9): verdict='relevant' AND product_informative (rr-v2 규칙, CLAUDE.md 10.1).
CREATE OR REPLACE VIEW public.v_source_yield_30d WITH (security_invoker = true) AS
WITH x AS (
  SELECT i.source_key, count(*) AS collected, count(v.input_id) AS judged,
         count(*) FILTER (WHERE v.verdict = 'relevant' AND coalesce(v.product_informative, false)) AS usable
    FROM public.analysis_inputs i LEFT JOIN public.review_relevance_verdicts v ON v.input_id = i.id
   WHERE i.collected_at > now() - interval '30 days' GROUP BY i.source_key),
r AS (SELECT source_key, sum(requests) AS requests FROM public.review_collection_runs WHERE started_at > now() - interval '30 days' AND NOT dry_run GROUP BY source_key)
SELECT x.source_key, x.collected, x.judged, x.usable,
       round(100.0 * x.usable / nullif(x.judged, 0), 1) AS yield_pct,
       round(100.0 * x.usable / nullif(r.requests, 0), 2) AS usable_per_100_requests,
       round(100.0 * x.judged / nullif(x.collected, 0), 1) AS judge_cover_pct,
       coalesce(r.requests, 0) AS requests,
       CASE WHEN x.judged < 200 THEN 'unknown'
            WHEN 100.0 * x.usable / x.judged >= 40 THEN 'A' WHEN 100.0 * x.usable / x.judged >= 15 THEN 'B'
            WHEN 100.0 * x.usable / x.judged >= 5 THEN 'C' ELSE 'D' END AS grade
  FROM x LEFT JOIN r USING (source_key);

CREATE OR REPLACE VIEW public.v_area_asset_progress WITH (security_invoker = true) AS
WITH t AS (SELECT l.area_slug, t.project_id, t.id AS target_id, t.total_collected FROM public.target_area_links l JOIN public.review_targets t ON t.id = l.target_id),
apps AS (SELECT area_slug, count(DISTINCT project_id) FILTER (WHERE total_collected > 0) AS apps_with_data, count(DISTINCT project_id) AS apps_registered FROM t GROUP BY area_slug),
inp AS (
  SELECT p.area_slug,
         count(*) FILTER (WHERE i.source_key IN ('appstore','googleplay') AND i.rating <= 2) AS low_rating,
         count(*) FILTER (WHERE i.lang = 'ko') AS ko,
         count(*) AS posts,
         count(*) FILTER (WHERE i.source_key NOT IN ('appstore','googleplay')) AS community_posts
    FROM (SELECT DISTINCT area_slug, project_id FROM t) p JOIN public.analysis_inputs i ON i.project_id = p.project_id GROUP BY p.area_slug)
SELECT a.area_slug, a.apps_registered, a.apps_with_data, coalesce(i.low_rating, 0) AS low_rating, coalesce(i.ko, 0) AS ko,
       round(100.0 * coalesce(i.ko, 0) / nullif(i.posts, 0), 1) AS ko_pct, coalesce(i.community_posts, 0) AS community_posts,
       (a.apps_with_data >= 8 AND coalesce(i.low_rating, 0) >= 150 AND (coalesce(i.ko, 0) >= 100 OR 100.0 * coalesce(i.ko, 0) / nullif(i.posts, 0) >= 20) AND coalesce(i.community_posts, 0) >= 30) AS passes_all
  FROM apps a LEFT JOIN inp i USING (area_slug);

CREATE OR REPLACE VIEW public.v_collect_new_onboarded WITH (security_invoker = true) AS
SELECT s.key AS source_key, s.display_name, 'community'::text AS layer, s.robots_status, s.tos_status, s.override, s.quote_policy,
       (SELECT count(*) FROM public.analysis_inputs i WHERE i.source_key = s.key AND i.collected_at > now() - interval '1 day') AS new_items_1d,
       (SELECT count(*) FROM public.analysis_inputs i JOIN public.review_relevance_verdicts v ON v.input_id = i.id WHERE i.source_key = s.key) AS judged,
       (SELECT coalesce(sum(r.blocked_responses), 0) + coalesce(sum(r.quota_responses), 0) FROM public.review_collection_runs r WHERE r.source_key = s.key AND r.started_at > now() - interval '1 day') AS blocked_1d,
       (SELECT min(t.onboard_batch) FROM public.review_targets t WHERE t.source_key = s.key) AS onboard_batch,
       CASE s.tos_status WHEN 'prohibited' THEN 1 WHEN 'forbids_automation' THEN 2 WHEN 'unverified' THEN 3 ELSE 4 END AS label_weight,
       s.enabled
  FROM public.review_sources s WHERE s.override = 'owner_2026-11-19'
UNION ALL
SELECT t.source_key, t.label, 'board', NULL, NULL, 'owner_2026-11-19', NULL, 0, 0, 0, t.onboard_batch, 9, true
  FROM public.review_targets t WHERE t.onboard_batch IS NOT NULL AND t.layer = 'board' AND t.created_at > now() - interval '2 days'
   AND NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = t.source_key AND s.override = 'owner_2026-11-19');

CREATE OR REPLACE VIEW public.v_collect_briefing_daily WITH (security_invoker = true) AS
SELECT 1 AS section, row_number() OVER (ORDER BY label_weight, source_key) AS sort, source_key AS label, coalesce(new_items_1d, 0)::text AS value, NULL::text AS delta,
       'tos=' || coalesce(tos_status, '-') || ' · 판정 ' || judged || ' · 차단 ' || blocked_1d || ' · 묶음 ' || coalesce(onboard_batch, '-') AS note FROM public.v_collect_new_onboarded
UNION ALL
SELECT 2, 1, 'collected_yesterday', count(*)::text, NULL, '전날 수집 총건수' FROM public.analysis_inputs WHERE collected_at >= date_trunc('day', now() - interval '1 day') AND collected_at < date_trunc('day', now())
UNION ALL
SELECT 2, 2, 'judged_yesterday', count(*)::text, NULL, '전날 판정 수' FROM public.review_relevance_verdicts WHERE judged_at >= date_trunc('day', now() - interval '1 day') AND judged_at < date_trunc('day', now())
UNION ALL
SELECT 3, row_number() OVER (ORDER BY sum(blocked_responses + quota_responses) DESC), source_key, sum(blocked_responses + quota_responses)::text, NULL, '24시간 차단·한도 응답'
  FROM public.review_collection_runs WHERE started_at > now() - interval '1 day' AND (blocked_responses > 0 OR quota_responses > 0) GROUP BY source_key
UNION ALL
SELECT 4, row_number() OVER (ORDER BY source_key), source_key, grade, yield_pct::text, '끌지 볼 곳(자동으로 꺼지지 않음)' FROM public.v_source_yield_30d WHERE grade = 'D'
UNION ALL
SELECT 5, 1, 'discovery_new_candidates_1d', count(*)::text, NULL, 'collect_frontier 새 행(어제~)' FROM public.collect_frontier WHERE discovered_at > now() - interval '1 day'
UNION ALL
SELECT 5, 2, 'discovery_candidates_1d', count(*)::text, NULL, 'discovery_candidates 새 행' FROM public.discovery_candidates WHERE created_at > now() - interval '1 day'
UNION ALL
SELECT 6, row_number() OVER (ORDER BY area_slug), area_slug, passes_all::text, NULL, 'apps ' || apps_with_data || ' · 1~2점 ' || low_rating || ' · ko ' || ko || ' · 커뮤니티 ' || community_posts FROM public.v_area_asset_progress
UNION ALL
SELECT 7, row_number() OVER (ORDER BY count(*)), t.source_key, count(*)::text, NULL, '활성·방문 대기 타깃 수(적을수록 재고 부족)'
  FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
 WHERE t.status = 'active' AND (t.next_visit_at IS NULL OR t.next_visit_at <= now() + interval '3 days') GROUP BY t.source_key HAVING count(*) < 6
UNION ALL
SELECT 8, 1, 'judge_backlog', count(*)::text, NULL, '판정 대기(미판정·미퍼지)'
  FROM public.analysis_inputs i WHERE i.purged_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.review_relevance_verdicts v WHERE v.input_id = i.id);

REVOKE ALL ON public.v_source_yield_30d, public.v_area_asset_progress, public.v_collect_new_onboarded, public.v_collect_briefing_daily FROM anon, authenticated;
