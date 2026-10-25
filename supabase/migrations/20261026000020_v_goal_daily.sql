-- 20261026000020_v_goal_daily — v71be 1-1: 매일 고정 칸(수집 신규 / 쓸 수 있는 정보 / 수확률)의 읽기 뷰.
-- 새 뷰 1개, 기존 객체 무변경(add-only). security_invoker + anon/authenticated 권한 회수(v_input_area 와 같은 관례) → service_role 전용.
-- 쓸 수 있는 정보 = verdict='relevant' ∧ (second_verdict='relevant' ∨ auto_approved_at IS NOT NULL) ∧ 프로젝트 영역 ∈ ①~⑤ (10-22 확정 정의).
--   날짜는 "쓸 수 있게 된 시각"(2차 판정 또는 자동 승인 중 늦은 쪽)의 KST 날짜다 — 백필·밀린 2차 판정이 해소된 날 크게 보일 수 있다.
-- 롤백: DROP VIEW public.v_goal_daily;
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
     AND greatest(coalesce(v.second_judged_at, '-infinity'::timestamptz), coalesce(v.auto_approved_at, '-infinity'::timestamptz)) >= (now() - interval '16 days')
   GROUP BY 1
)
SELECT coalesce(n.dt, u.dt) AS dt, coalesce(n.new_in, 0) AS new_in, coalesce(n.new_in_area, 0) AS new_in_area, coalesce(u.usable, 0) AS usable
  FROM n FULL JOIN u ON u.dt = n.dt;
COMMENT ON VIEW public.v_goal_daily IS '일별 수집 신규·영역 안 신규·쓸 수 있는 정보(①~⑤, KST). v71be 1-1 고정 칸의 근거.';
REVOKE ALL ON public.v_goal_daily FROM anon, authenticated;
COMMIT;
