-- v71cu S14 후보 집계(읽기 전용 SELECT). 오케스트레이터가 execute_sql 로 실행하고 결과 JSON 배열을 company-candidates.mjs 에 넣는다.
-- 4분야 링크(target_area_links) → 프로젝트별 analysis_inputs 집계. 한국어=lang 'ko', 1~2점=rating<=2. 기준 필터는 스크립트가 한다.
-- 이름 칸: analysis_projects 에 name 이 없어 competitor_url 을 쓴다(사람이 표에서 보고 회사명으로 고친다).
SELECT p.id AS project_id, l.area_slug, p.competitor_url AS company_name,
       count(*) AS total,
       count(*) FILTER (WHERE i.lang = 'ko') AS ko,
       count(*) FILTER (WHERE i.rating <= 2) AS low_total,
       count(*) FILTER (WHERE i.rating <= 2 AND i.lang = 'ko') AS ko_low,
       count(*) FILTER (WHERE i.rating = 1) AS low1,
       count(*) FILTER (WHERE i.rating = 2) AS low2
  FROM (SELECT DISTINCT l.area_slug, t.project_id FROM public.target_area_links l JOIN public.review_targets t ON t.id = l.target_id) l
  JOIN public.analysis_projects p ON p.id = l.project_id
  JOIN public.analysis_inputs i ON i.project_id = p.id
 GROUP BY p.id, l.area_slug, p.competitor_url
 ORDER BY low_total DESC;
