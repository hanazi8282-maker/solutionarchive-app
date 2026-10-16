-- v71ad §2 3일 판정 측정 — ② 영업 하루 승인 증가(읽기 전용, CEO-staff 가 돌린다).
-- 판정 규칙(남헌): 3일 뒤 ② 승인 증가가 하루 평균 50건 미만이면 design 에 합친다(합치기 초안: PR 초안 area2-merge 참고).
-- 승인 = human_verdict='relevant' OR (human_verdict IS NULL AND auto_approved_at IS NOT NULL).
-- 승인 시각 = 사람 승인은 human_graded_at(없으면 judged_at), 자동 승인은 auto_approved_at. 날짜는 KST.
-- 영역 = 그 판정 행 project_id 의 analysis_projects.area_code(= v_input_area 와 같은 기준). 라벨 접두가 아니다.
-- ⚠️ #559 로 넣은 앱스토어 타깃은 수집(nightly) → extract → 1·2차 판정 → 자동 승인까지 하루 이상 걸린다. 첫 1~2일이 0 이어도 고장이 아니라 지연일 수 있다 —
--    아래 [3] 의 단계별 수(수집·판정·승인)를 같이 본다.

-- [1] 날짜별(KST) ② 승인 수 — 최근 14일, 0 인 날도 찍는다.
WITH ap AS (
  SELECT CASE WHEN v.human_verdict = 'relevant' THEN coalesce(v.human_graded_at, v.judged_at)
              WHEN v.human_verdict IS NULL AND v.auto_approved_at IS NOT NULL THEN v.auto_approved_at END AS approved_at,
         v.human_verdict IS NOT NULL AS by_human
    FROM public.review_relevance_verdicts v
    JOIN public.analysis_projects p ON p.id = v.project_id
   WHERE p.area_code = '2'
), d AS (
  SELECT generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - 13, (now() AT TIME ZONE 'Asia/Seoul')::date, interval '1 day')::date AS kst_date
)
SELECT d.kst_date,
       count(ap.approved_at) AS approved,
       count(ap.approved_at) FILTER (WHERE ap.by_human) AS by_human,
       count(ap.approved_at) FILTER (WHERE NOT ap.by_human) AS by_auto
  FROM d LEFT JOIN ap ON (ap.approved_at AT TIME ZONE 'Asia/Seoul')::date = d.kst_date
 GROUP BY d.kst_date ORDER BY d.kst_date;

-- [2] 판정값 — 기준일(:start = #559 적용 KST 날짜, 예 '2026-10-18') 부터 3일(오늘 제외 완결일만)의 하루 평균과 판정.
--     :start 를 손으로 바꿔 넣는다. 완결일이 3일 미만이면 verdict = '확인 불가(기간 부족)' — 미달로 접지 않는다.
WITH params AS (SELECT DATE '2026-10-18' AS start_kst),
ap AS (
  SELECT (CASE WHEN v.human_verdict = 'relevant' THEN coalesce(v.human_graded_at, v.judged_at)
               WHEN v.human_verdict IS NULL AND v.auto_approved_at IS NOT NULL THEN v.auto_approved_at END AT TIME ZONE 'Asia/Seoul')::date AS kst_date
    FROM public.review_relevance_verdicts v JOIN public.analysis_projects p ON p.id = v.project_id
   WHERE p.area_code = '2'
), w AS (
  SELECT pr.start_kst, LEAST(pr.start_kst + 2, (now() AT TIME ZONE 'Asia/Seoul')::date - 1) AS end_kst FROM params pr
)
SELECT w.start_kst, w.end_kst, (w.end_kst - w.start_kst + 1) AS full_days,
       count(ap.kst_date) AS approved_total,
       round(count(ap.kst_date)::numeric / NULLIF(w.end_kst - w.start_kst + 1, 0), 1) AS per_day,
       CASE WHEN w.end_kst - w.start_kst + 1 < 3 THEN '확인 불가(기간 부족)'
            WHEN count(ap.kst_date)::numeric / 3 < 50 THEN '미달 → design 합치기 조건'
            ELSE '충족 → ② 유지' END AS verdict
  FROM w LEFT JOIN ap ON ap.kst_date BETWEEN w.start_kst AND w.end_kst
 GROUP BY w.start_kst, w.end_kst;

-- [3] 단계별 — ② 프로젝트의 날짜별(KST) 새 입력 · 1차 판정 · 승인. 승인이 0 일 때 어디서 막혔는지 가른다.
WITH p2 AS (SELECT id FROM public.analysis_projects WHERE area_code = '2'),
d AS (SELECT generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - 6, (now() AT TIME ZONE 'Asia/Seoul')::date, interval '1 day')::date AS kst_date)
SELECT d.kst_date,
       (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id IN (SELECT id FROM p2)
           AND (i.created_at AT TIME ZONE 'Asia/Seoul')::date = d.kst_date) AS new_inputs,
       (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id IN (SELECT id FROM p2)
           AND (v.judged_at AT TIME ZONE 'Asia/Seoul')::date = d.kst_date) AS judged,
       (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id IN (SELECT id FROM p2)
           AND v.human_verdict IS NULL AND (v.auto_approved_at AT TIME ZONE 'Asia/Seoul')::date = d.kst_date) AS auto_approved
  FROM d ORDER BY d.kst_date;

-- [4] #559 로 만든 새 ② 프로젝트만 따로(새 앱이 승인에 얼마나 보탰나).
SELECT (CASE WHEN v.human_verdict = 'relevant' THEN coalesce(v.human_graded_at, v.judged_at) ELSE v.auto_approved_at END
          AT TIME ZONE 'Asia/Seoul')::date AS kst_date, count(*) AS approved_new_apps
  FROM public.review_relevance_verdicts v JOIN public.analysis_projects p ON p.id = v.project_id
 WHERE p.area_rule_ver = 'sales-v71ad'
   AND (v.human_verdict = 'relevant' OR (v.human_verdict IS NULL AND v.auto_approved_at IS NOT NULL))
 GROUP BY 1 ORDER BY 1;
