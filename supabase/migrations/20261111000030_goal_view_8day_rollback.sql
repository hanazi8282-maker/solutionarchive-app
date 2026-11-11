-- 롤백: 창을 16일로 되돌린다(20261105000010 의 뷰 정의).
BEGIN;
CREATE OR REPLACE VIEW public.v_goal_daily WITH (security_invoker = true) AS
WITH n AS (
  SELECT (i.collected_at AT TIME ZONE 'Asia/Seoul')::date AS dt,
         count(*) AS new_in,
         count(*) FILTER (WHERE p.area_code IN ('1','2','3','4','5')) AS new_in_area
    FROM public.analysis_inputs i
    JOIN public.analysis_projects p ON p.id = i.project_id
   WHERE i.purged_at IS NULL AND i.collected_at >= (now() - interval '16 days')
   GROUP BY 1
), u AS (
  SELECT (greatest(coalesce(v.second_judged_at, '-infinity'::timestamptz), coalesce(v.auto_approved_at, '-infinity'::timestamptz)) AT TIME ZONE 'Asia/Seoul')::date AS dt,
         count(*) AS usable
    FROM public.review_relevance_verdicts v
    JOIN public.analysis_inputs i ON i.id = v.input_id
    JOIN public.analysis_projects p ON p.id = i.project_id
   WHERE v.verdict = 'relevant'
     AND (v.second_verdict = 'relevant' OR v.auto_approved_at IS NOT NULL)
     AND p.area_code IN ('1','2','3','4','5')
     AND (v.second_judged_at >= (now() - interval '16 days') OR v.auto_approved_at >= (now() - interval '16 days'))
   GROUP BY 1
)
SELECT coalesce(n.dt, u.dt) AS dt, coalesce(n.new_in, 0) AS new_in, coalesce(n.new_in_area, 0) AS new_in_area, coalesce(u.usable, 0) AS usable
  FROM n FULL JOIN u ON u.dt = n.dt;
COMMENT ON VIEW public.v_goal_daily IS '일별 수집 신규·영역 안 신규·쓸 수 있는 정보(①~⑤, KST). v71be 1-1 고정 칸의 근거.';
REVOKE ALL ON public.v_goal_daily FROM anon, authenticated;

COMMIT;
