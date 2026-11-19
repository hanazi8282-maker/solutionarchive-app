-- 20261119000014 롤백: collect_build_report 를 000007 본문, v_collect_briefing_daily 를 000006 본문으로 되돌리고
-- 새 뷰 3개·인덱스 1개를 지운다. 뷰·인덱스·함수만 — 데이터 손실 없음(collect_daily_report 에 이미 굳은 행은 그대로).
CREATE OR REPLACE FUNCTION public.collect_build_report(p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s' AS $$
DECLARE payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'briefing', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.section, b.sort), '[]') FROM public.v_collect_briefing_daily b),
    'new_onboarded', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.label_weight), '[]') FROM public.v_collect_new_onboarded n),
    'source_yield_30d', (SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.source_key), '[]') FROM public.v_source_yield_30d y),
    'area_progress', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM public.v_area_asset_progress a),
    'generated_at', now()) INTO payload;
  INSERT INTO public.collect_daily_report(report_date, payload) VALUES (p_date, payload)
    ON CONFLICT (report_date) DO UPDATE SET payload = EXCLUDED.payload, created_at = now();
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.collect_build_report(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_build_report(date) TO service_role;

-- 행이 줄어드는 뷰 교체는 CREATE OR REPLACE 로 된다(컬럼 동일).
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
REVOKE ALL ON public.v_collect_briefing_daily FROM anon, authenticated;

DROP VIEW IF EXISTS public.v_collect_funnel_daily;
DROP VIEW IF EXISTS public.v_collect_canary;
DROP VIEW IF EXISTS public.v_collect_heartbeat;
DROP INDEX IF EXISTS public.review_relevance_verdicts_judged_at_idx;
