-- v71aj §4-1 확인 쿼리 — 20261017000010_sales_appstore_targets_20261017 (② 영업 앱 29개·앱스토어 타깃 31행 중 게이트 허용 상위 N). 전부 읽기 전용.
-- 적용 전 1·2·3, 적용 후 4~8. 기대값은 각 쿼리 끝 주석.

-- [전 1 음성] 같은 앱 ID 의 appstore 타깃이 이미 있는가(어느 국가·프로젝트든). 있으면 그 앱은 마이그가 건너뛴다.
SELECT v.app_id, v.name, t.product_ref, t.label, t.status
  FROM (VALUES ('404249815', 'Salesforce'), ('910768078', 'LinkedIn Sales Navigator'), ('1459654107', 'Covve'), ('596927802', 'Cloze'), ('444908810', 'Zoho CRM'), ('1421097870', 'Keap'), ('1094699978', 'Zoho SalesIQ'), ('561683423', 'Bitrix24'), ('1239908329', 'ActiveCampaign'), ('879884387', 'SalesRabbit'), ('1156351688', 'JustCall'), ('789934914', 'Badger Maps'), ('1454212098', 'Bigin'), ('1485578688', 'Dynamics 365 Sales'), ('921456160', 'Pipedrive'), ('1114709439', 'Salesmate'), ('651636273', 'Nimble'), ('1073125057', 'Freshsales'), ('953610296', 'Map My Customers'), ('941438829', 'Copper'), ('965269916', 'Daylite'), ('692777054', 'OnePageCRM'), ('1021338425', 'Aircall'), ('563017797', 'Insightly'), ('674067680', 'Streak'), ('1629889716', 'Repsly'), ('337938121', 'Nutshell'), ('1079498089', 'noCRM.io'), ('1668836284', 'Close')) v(app_id, name)
  JOIN public.review_targets t ON t.source_key = 'appstore' AND split_part(t.product_ref, ':', 2) = v.app_id;   -- 기대: 0행

-- [전 2 음성] 이름 키가 같은 기존 프로젝트(동명 다른 제품일 수 있음 — 있으면 그 앱은 건너뛰고 사람이 본다).
SELECT v.name, p.id, p.product_elevator_pitch, p.area_code
  FROM (VALUES ('404249815', 'Salesforce'), ('910768078', 'LinkedIn Sales Navigator'), ('1459654107', 'Covve'), ('596927802', 'Cloze'), ('444908810', 'Zoho CRM'), ('1421097870', 'Keap'), ('1094699978', 'Zoho SalesIQ'), ('561683423', 'Bitrix24'), ('1239908329', 'ActiveCampaign'), ('879884387', 'SalesRabbit'), ('1156351688', 'JustCall'), ('789934914', 'Badger Maps'), ('1454212098', 'Bigin'), ('1485578688', 'Dynamics 365 Sales'), ('921456160', 'Pipedrive'), ('1114709439', 'Salesmate'), ('651636273', 'Nimble'), ('1073125057', 'Freshsales'), ('953610296', 'Map My Customers'), ('941438829', 'Copper'), ('965269916', 'Daylite'), ('692777054', 'OnePageCRM'), ('1021338425', 'Aircall'), ('563017797', 'Insightly'), ('674067680', 'Streak'), ('1629889716', 'Repsly'), ('337938121', 'Nutshell'), ('1079498089', 'noCRM.io'), ('1668836284', 'Close')) v(app_id, name)
  JOIN public.analysis_projects p
    ON regexp_replace(lower(regexp_replace(substring(p.product_elevator_pitch from '^(.{2,40}?)\s(?:—|\()'), '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g')
     = regexp_replace(lower(regexp_replace(v.name, '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g');   -- 기대: 0행

-- [전 3] 게이트 허용 N(마이그 안의 식과 같다) + 순서 확인(#554 기록 표가 없어야 한다).
SELECT a.as_active, a.total_active, a.gp_active,
       GREATEST(0, floor((0.3 * a.total_active - a.as_active) / 0.7))::int AS n_allowed,
       to_regclass('public.review_targets_window_batch_20261017') IS NULL AS order_ok
  FROM (SELECT count(*) FILTER (WHERE t.source_key = 'appstore') AS as_active, count(*) AS total_active,
               count(*) FILTER (WHERE t.source_key = 'googleplay') AS gp_active
          FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
         WHERE t.status = 'active') a;   -- 기대: order_ok = true. n_allowed ≥ 31 이면 31행 전부, 아니면 평가 수 상위 n_allowed 행

-- [후 4 양성] 기록 표 행 수 = min(31, 전 3 n_allowed), 전부 active·미방문·라벨 ^2:
SELECT count(*) AS logged,
       count(*) FILTER (WHERE t.status = 'active' AND t.last_run_at IS NULL) AS active_unvisited,
       count(*) FILTER (WHERE t.label !~ '^2:') AS bad_label
  FROM public.review_targets_sales_batch_20261017 b JOIN public.review_targets t ON t.id = b.target_id;   -- 기대: logged = active_unvisited, bad_label 0

-- [후 5 양성] 새 프로젝트: 뽑힌 앱 수만큼, 전부 ② · manual · collecting, 타깃 없는 프로젝트 0.
SELECT count(*) AS projects,
       count(*) FILTER (WHERE p.area_code = '2' AND p.area_basis = 'manual' AND p.status = 'collecting') AS ok,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = p.id)) AS empty
  FROM public.analysis_projects p WHERE p.area_rule_ver = 'sales-v71aj';   -- 기대: projects = ok = 기록 표 slug 수, empty 0

-- [후 6 음성] 게이트 안 · googleplay 활성 불변(전 3 gp_active 와 같아야 한다).
SELECT count(*) FILTER (WHERE t.source_key = 'appstore') AS as_active, count(*) AS total_active,
       count(*) FILTER (WHERE t.source_key = 'googleplay') AS gp_active,
       count(*) FILTER (WHERE t.source_key = 'appstore') <= 0.3 * count(*) AS within_gate
  FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled WHERE t.status = 'active';   -- 기대: within_gate true

-- [후 7 음성] 기록 표 밖에서 새로 생긴 appstore 타깃 0(같은 시간대 nightly-window-discovery 행은 reports/window-adopted.json 과 대조).
SELECT count(*) FROM public.review_targets t
 WHERE t.source_key = 'appstore' AND t.created_at >= now() - interval '1 hour'
   AND NOT EXISTS (SELECT 1 FROM public.review_targets_sales_batch_20261017 b WHERE b.target_id = t.id);   -- 기대: 0

-- [후 8] #554 에 남는 칸 — 다음 마이그(20261017000020)가 쓸 N.
SELECT GREATEST(0, floor((0.3 * count(*) - count(*) FILTER (WHERE t.source_key = 'appstore')) / 0.7))::int AS left_for_554
  FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled WHERE t.status = 'active';
