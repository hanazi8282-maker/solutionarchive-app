-- v71cu S6b(§1-3 안정화 3종): 심장박동·소스 카나리·깔때기 5숫자 뷰 + 브리핑 섹션 9~11 + collect_build_report 에 3키 추가.
-- 추가 전용: 새 뷰 3개·인덱스 1개. 기존 v_collect_briefing_daily 는 같은 컬럼으로 행(UNION)만 늘리고, collect_build_report 는 키만 늘린다.
-- 롤백: 20261119000014_collect_stability_views_rollback.sql (000006 뷰·000007 함수 본문으로 되돌림).
-- 3상태 규칙(CLAUDE.md §7.1): 확인 못 한 것은 'unknown'/'never' 로 따로 찍고 ok 로 접지 않는다.
-- 뷰는 collect_build_report(SECURITY DEFINER, statement_timeout 180s) 안에서 읽는다 — REST 로 직접 부르지 말 것(~8s 시간초과).

-- 판정 시각 범위 집계(섹션 2·11)가 표 전체를 훑지 않게.
CREATE INDEX IF NOT EXISTS review_relevance_verdicts_judged_at_idx ON public.review_relevance_verdicts (judged_at);

-- (1) 심장박동: 켜진 소스마다 마지막 성공 실행. 26시간 초과=stale, 30일 실행 기록 없음=never.
CREATE OR REPLACE VIEW public.v_collect_heartbeat WITH (security_invoker = true) AS
SELECT s.key AS source_key, l.last_ok_at, l.last_run_at, l.last_status,
       round(extract(epoch FROM now() - l.last_ok_at) / 3600.0, 1) AS hours_since_ok,
       CASE WHEN l.last_run_at IS NULL THEN 'never'
            WHEN l.last_ok_at IS NULL OR l.last_ok_at < now() - interval '26 hours' THEN 'stale'
            ELSE 'ok' END AS state
  FROM public.review_sources s
  LEFT JOIN LATERAL (
    SELECT max(coalesce(r.finished_at, r.started_at)) FILTER (WHERE r.status = 'ok') AS last_ok_at,
           max(r.started_at) AS last_run_at,
           (array_agg(r.status ORDER BY r.started_at DESC))[1] AS last_status
      FROM public.review_collection_runs r
     WHERE r.source_key = s.key AND NOT r.dry_run AND r.started_at > now() - interval '30 days') l ON true
 WHERE s.enabled;

-- (2) 소스 카나리: 24시간 실행 합계로 "글이 나왔나"를 본다.
--   ok=파싱된 글 > 0 (실패율이 평소 3배·5% 이상이면 parse_fail)
--   parse_fail=글 0 + 파싱 실패 > 0, 또는 실패율 급증 → 파서 필드가 사라졌을 가능성
--   empty=페이지는 받았는데 글도 실패도 0 → 진짜 빈 것인지 셀렉터가 아무것도 못 잡은 것인지 사람 확인
--   unknown=24시간 실행 없음 또는 받은 페이지 0(차단·요청 실패) → 확인 불가
CREATE OR REPLACE VIEW public.v_collect_canary WITH (security_invoker = true) AS
WITH r AS (
  SELECT source_key,
         count(*) FILTER (WHERE started_at > now() - interval '1 day') AS runs_1d,
         coalesce(sum(pages_fetched) FILTER (WHERE started_at > now() - interval '1 day'), 0) AS pages_1d,
         coalesce(sum(reviews_parsed) FILTER (WHERE started_at > now() - interval '1 day'), 0) AS parsed_1d,
         coalesce(sum(parse_failures) FILTER (WHERE started_at > now() - interval '1 day'), 0) AS fails_1d,
         coalesce(sum(reviews_parsed) FILTER (WHERE started_at <= now() - interval '1 day'), 0) AS parsed_base,
         coalesce(sum(parse_failures) FILTER (WHERE started_at <= now() - interval '1 day'), 0) AS fails_base
    FROM public.review_collection_runs
   WHERE NOT dry_run AND status <> 'running' AND started_at > now() - interval '8 days'
   GROUP BY source_key),
x AS (
  SELECT s.key AS source_key, coalesce(r.runs_1d, 0) AS runs_1d, coalesce(r.pages_1d, 0) AS pages_1d,
         coalesce(r.parsed_1d, 0) AS parsed_1d, coalesce(r.fails_1d, 0) AS fails_1d,
         round(1.0 * r.fails_1d / nullif(r.parsed_1d + r.fails_1d, 0), 3) AS fail_rate_1d,
         round(1.0 * r.fails_base / nullif(r.parsed_base + r.fails_base, 0), 3) AS fail_rate_base
    FROM public.review_sources s LEFT JOIN r ON r.source_key = s.key
   WHERE s.enabled)
SELECT x.*,
       CASE WHEN x.runs_1d = 0 OR x.pages_1d = 0 THEN 'unknown'
            WHEN x.parsed_1d = 0 AND x.fails_1d > 0 THEN 'parse_fail'
            WHEN x.parsed_1d = 0 THEN 'empty'
            WHEN x.fail_rate_1d >= 0.05 AND x.fail_rate_1d >= 3 * coalesce(x.fail_rate_base, 0) THEN 'parse_fail'
            ELSE 'ok' END AS state
  FROM x;

-- (3) 깔때기 5숫자: 어제(DB 날짜 기준, 섹션 2 와 같은 경계) vs 그제. 어느 칸이든 그제의 절반 아래면 alert.
CREATE OR REPLACE VIEW public.v_collect_funnel_daily WITH (security_invoker = true) AS
WITH b AS (SELECT date_trunc('day', now()) AS t0, date_trunc('day', now()) - interval '1 day' AS t1, date_trunc('day', now()) - interval '2 days' AS t2),
ev AS (
  SELECT 1 AS ord, created_at AS ts FROM public.discovery_candidates, b WHERE created_at >= b.t2 AND created_at < b.t0
  UNION ALL SELECT 1, created_at FROM public.source_candidates, b WHERE created_at >= b.t2 AND created_at < b.t0
  UNION ALL SELECT 2, probe_at FROM public.discovery_candidates, b WHERE probe_at >= b.t2 AND probe_at < b.t0
  UNION ALL SELECT 2, robots_checked_at FROM public.source_candidates, b WHERE robots_checked_at >= b.t2 AND robots_checked_at < b.t0
  UNION ALL SELECT 3, created_at FROM public.review_targets, b WHERE onboard_batch IS NOT NULL AND created_at >= b.t2 AND created_at < b.t0
  UNION ALL SELECT 4, collected_at FROM public.analysis_inputs, b WHERE collected_at >= b.t2 AND collected_at < b.t0
  UNION ALL SELECT 5, judged_at FROM public.review_relevance_verdicts, b WHERE judged_at >= b.t2 AND judged_at < b.t0)
SELECT s.ord, s.stage, s.what,
       count(e.ts) FILTER (WHERE e.ts >= b.t1) AS yesterday,
       count(e.ts) FILTER (WHERE e.ts < b.t1) AS day_before,
       (count(e.ts) FILTER (WHERE e.ts < b.t1) > 0
        AND count(e.ts) FILTER (WHERE e.ts >= b.t1) < count(e.ts) FILTER (WHERE e.ts < b.t1) / 2.0) AS alert
  FROM (VALUES (1, 'discovered', '발굴(discovery_candidates·source_candidates 새 행)'),
               (2, 'tested', '시험(discovery probe_at·source robots_checked_at)'),
               (3, 'provisional', '임시 등록(review_targets onboard_batch 새 행)'),
               (4, 'collected', '수집(analysis_inputs collected_at)'),
               (5, 'judged', '판정(review_relevance_verdicts judged_at)')) AS s(ord, stage, what)
  CROSS JOIN b LEFT JOIN ev e ON e.ord = s.ord
 GROUP BY s.ord, s.stage, s.what, b.t1;

-- 브리핑 뷰: 000006 본문 그대로 + 섹션 9(심장박동)·10(카나리)·11(깔때기). 각 섹션 sort 0 요약 줄은 늘 나온다(빈 칸 ≠ 정상 확인).
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
  FROM public.analysis_inputs i WHERE i.purged_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.review_relevance_verdicts v WHERE v.input_id = i.id)
UNION ALL
SELECT 9, 0, 'heartbeat_summary', count(*) FILTER (WHERE state <> 'ok')::text, NULL,
       '켜진 소스 ' || count(*) || ' · ok ' || count(*) FILTER (WHERE state = 'ok') || ' · 26시간 초과 ' || count(*) FILTER (WHERE state = 'stale') || ' · 30일 실행 기록 없음 ' || count(*) FILTER (WHERE state = 'never')
  FROM public.v_collect_heartbeat
UNION ALL
SELECT 9, row_number() OVER (ORDER BY hours_since_ok DESC NULLS FIRST, source_key), source_key, state, coalesce(hours_since_ok::text || 'h', '성공 없음'),
       '마지막 성공 ' || coalesce(to_char(last_ok_at, 'YYYY-MM-DD HH24:MI'), '없음') || ' · 마지막 상태 ' || coalesce(last_status, '-')
  FROM public.v_collect_heartbeat WHERE state <> 'ok'
UNION ALL
SELECT 10, 0, 'canary_summary', count(*) FILTER (WHERE state <> 'ok')::text, NULL,
       'ok ' || count(*) FILTER (WHERE state = 'ok') || ' · 파싱 실패 ' || count(*) FILTER (WHERE state = 'parse_fail') || ' · 빈 결과 ' || count(*) FILTER (WHERE state = 'empty') || ' · 확인 불가 ' || count(*) FILTER (WHERE state = 'unknown')
  FROM public.v_collect_canary
UNION ALL
SELECT 10, row_number() OVER (ORDER BY CASE state WHEN 'parse_fail' THEN 1 WHEN 'empty' THEN 2 ELSE 3 END, source_key), source_key, state,
       coalesce('실패율 ' || fail_rate_1d::text || ' / 평소 ' || coalesce(fail_rate_base::text, '-'), NULL),
       '24h 실행 ' || runs_1d || ' · 페이지 ' || pages_1d || ' · 파싱 ' || parsed_1d || ' · 실패 ' || fails_1d
  FROM public.v_collect_canary WHERE state <> 'ok'
UNION ALL
SELECT 11, ord, stage, yesterday::text, '그제 ' || day_before, what || CASE WHEN alert THEN ' · [경보] 그제의 절반 아래' ELSE '' END
  FROM public.v_collect_funnel_daily;

REVOKE ALL ON public.v_collect_heartbeat, public.v_collect_canary, public.v_collect_funnel_daily, public.v_collect_briefing_daily FROM anon, authenticated;

-- collect_build_report: 000007 본문 + heartbeat·canary·funnel 3키.
CREATE OR REPLACE FUNCTION public.collect_build_report(p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s' AS $$
DECLARE payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'briefing', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.section, b.sort), '[]') FROM public.v_collect_briefing_daily b),
    'new_onboarded', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.label_weight), '[]') FROM public.v_collect_new_onboarded n),
    'source_yield_30d', (SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.source_key), '[]') FROM public.v_source_yield_30d y),
    'area_progress', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM public.v_area_asset_progress a),
    'heartbeat', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.source_key), '[]') FROM public.v_collect_heartbeat h),
    'canary', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.source_key), '[]') FROM public.v_collect_canary c),
    'funnel', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ord), '[]') FROM public.v_collect_funnel_daily f),
    'generated_at', now()) INTO payload;
  INSERT INTO public.collect_daily_report(report_date, payload) VALUES (p_date, payload)
    ON CONFLICT (report_date) DO UPDATE SET payload = EXCLUDED.payload, created_at = now();
  RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.collect_build_report(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_build_report(date) TO service_role;
