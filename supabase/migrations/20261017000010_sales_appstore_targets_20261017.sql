-- ============================================================
-- 20261017000010_sales_appstore_targets_20261017
--
-- ⛔ 미적용·미머지 초안(v71aj §4-1 · D-43). 적용은 CEO-staff 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- ★ 적용 순서: 이 파일 → 20261017000020_window_targets_20261017(PR #554). 파일 번호도 그 순서다.
--   #554 가 먼저 적용돼 있으면(기록 표 review_targets_window_batch_20261017 존재) 여기서 RAISE 한다 — 30% 게이트 칸을 #554 가
--   먼저 먹었다는 뜻이라 ② 우선이 깨진다. 그때는 #554 롤백(타깃 failed → 활성에서 빠져 칸이 돌아온다) 뒤 이 파일 → #554 재적용.
--
-- 앱 ID 근거: iTunes Search API(/search) — 남헌 2026-10-17 v71aj D-43 정책 A(제한 허용·소유자 예외, docs/migration-exceptions.md).
--   v71ad 세션의 /search 41회 결과(남헌이 확인된 호출로 인정) + v71aj 세션 /search 26회(차단 신호 0). /lookup 은 쓰지 않았다.
--   판정은 lib/review/anchor.ts verifyAnchor(이름 일치·판매자 단일·평가 ≥50·판매자 도메인 = 공식 도메인) 그대로.
--   예외 2건(Bitrix24 · Dynamics 365 Sales): 판매자 URL 이 비어 있어, 앱 설명 안 공식 도메인 URL 로 확인(verifyAnchor descriptionDomain, domainVia='description').
--   근거: reports/2026-10-17/sales-apps-verified-v71aj.json · .md.
--
-- 무엇을: ② 영업 앱 29개의 앱스토어 타깃 31행(us 29 + kr 2) 중 **30% 게이트가 허용하는 만큼만** 넣는다.
--   새 소스가 아니다 — appstore(이미 enabled, 소유자 예외 owner_2026-10-05)에 새 타깃만.
--   N 은 적용 시점 수치로 계산한다(#554 와 같은 식, 하드코딩 없음):
--     as = 앱스토어 활성, total = enabled 소스 활성 전체. (as + N) ≤ 0.3 × (total + N) ⇔ N = floor((0.3 × total − as) / 0.7), 0 미만이면 0.
--   순위: 그 국가 스토어 평가 수(userRatingCount, 2026-10-17 실측) 내림차순 → product_ref. 31행 ≤ N 이면 전부 들어간다.
--   게이트에 막힌 행 수는 마지막 NOTICE 의 '게이트로 막힘' 에 찍힌다.
-- 프로젝트: 앱마다 새 analysis_projects 1행(② 영업, area_basis='manual', area_rule_ver='sales-v71aj'). **뽑힌 앱만** 만든다(빈 프로젝트 0).
--   기존 영업 프로젝트(예: HubSpot Sales Hub)에 붙이지 않는 이유: 프로젝트 = 경쟁 제품 1개이고 수요축(opportunity_score)·관련성 판정이
--   프로젝트 단위다. 다른 제품 리뷰를 섞으면 그 프로젝트의 수치가 오염되고 되돌리기도 어렵다.
--   같은 이름 키(소개문 앞 이름 정규화, candidate-register 와 같은 식)의 프로젝트가 이미 있으면 그 앱은 **건너뛴다**(재사용도 생성도 안 함 —
--   동명 다른 제품일 수 있어 사람이 본다). 같은 앱 ID 의 appstore 타깃이 어느 국가·프로젝트에든 있으면 그 앱도 건너뛴다.
-- 타깃: status='active' · last_run_at NULL(미방문 우선) · 카운터 기본값. 라벨 us '2:us|<slug>' · kr '2:<slug>'(기존 규약).
-- 넣은 행은 public.review_targets_sales_batch_20261017 에 남긴다(RLS on·정책 0 = service_role 전용, #554 와 같은 방식). 롤백은 이 표만 본다.
-- 손대지 않는 것: review_sources · review_source_ramp(요청 예산 불변) · 구글 플레이(이번 PR 에 없음 — 활성 85 > 동결 80).
-- 사후 가드(어긋나면 RAISE → 전체 롤백): 삽입 > N · 앱스토어 활성 > 0.3 × 전체 활성 · googleplay 활성 증가 · 프로젝트 없는 타깃.
-- 롤백: 20261017000010_sales_appstore_targets_20261017_rollback.sql
-- 확인 쿼리: reports/2026-10-17/sales-batch-checks.sql
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _sa_new (
  slug text NOT NULL, name text NOT NULL, pitch text NOT NULL, competitor_url text NOT NULL, app_id text NOT NULL,
  product_ref text NOT NULL, label text NOT NULL, ratings int NOT NULL,
  PRIMARY KEY (product_ref)
) ON COMMIT DROP;
INSERT INTO _sa_new (slug, name, pitch, competitor_url, app_id, product_ref, label, ratings) VALUES
  ('salesforce', 'Salesforce', 'Salesforce — Salesforce 모바일 앱(Sales Cloud 등 영업 CRM 의 모바일 클라이언트) (v71aj ② 영업 보강, 앱스토어 404249815)', 'https://salesforce.com/', '404249815', 'us:404249815', '2:us|salesforce', 353847),
  ('linkedin-sales-navigator', 'LinkedIn Sales Navigator', 'LinkedIn Sales Navigator — LinkedIn 의 리드 발굴·영업 탐색 도구 (v71aj ② 영업 보강, 앱스토어 910768078)', 'https://business.linkedin.com/', '910768078', 'us:910768078', '2:us|linkedin-sales-navigator', 51953),
  ('salesforce', 'Salesforce', 'Salesforce — Salesforce 모바일 앱(Sales Cloud 등 영업 CRM 의 모바일 클라이언트) (v71aj ② 영업 보강, 앱스토어 404249815)', 'https://salesforce.com/', '404249815', 'kr:404249815', '2:salesforce', 4270),
  ('covve', 'Covve', 'Covve — 명함 스캔·연락처 관리(영업 네트워킹용 개인 CRM) (v71aj ② 영업 보강, 앱스토어 1459654107)', 'https://covve.com/', '1459654107', 'us:1459654107', '2:us|covve', 4092),
  ('cloze', 'Cloze', 'Cloze — 영업·관계 관리 CRM(이메일·통화 자동 기록) (v71aj ② 영업 보강, 앱스토어 596927802)', 'https://cloze.com/', '596927802', 'us:596927802', '2:us|cloze', 2835),
  ('zoho-crm', 'Zoho CRM', 'Zoho CRM — Zoho 의 영업·마케팅 CRM (v71aj ② 영업 보강, 앱스토어 444908810)', 'https://zoho.com/', '444908810', 'us:444908810', '2:us|zoho-crm', 2691),
  ('keap', 'Keap', 'Keap — 소기업용 CRM·영업·마케팅 자동화 (v71aj ② 영업 보강, 앱스토어 1421097870)', 'https://keap.com/', '1421097870', 'us:1421097870', '2:us|keap', 1827),
  ('zoho-salesiq', 'Zoho SalesIQ', 'Zoho SalesIQ — 웹 방문자 추적·라이브챗 영업 도구 (v71aj ② 영업 보강, 앱스토어 1094699978)', 'https://zoho.com/salesiq/', '1094699978', 'us:1094699978', '2:us|zoho-salesiq', 1331),
  ('bitrix24', 'Bitrix24', 'Bitrix24 — 중소기업용 CRM·영업 파이프라인·협업 올인원 (v71aj ② 영업 보강, 앱스토어 561683423)', 'https://bitrix24.com/', '561683423', 'us:561683423', '2:us|bitrix24', 1292),
  ('activecampaign', 'ActiveCampaign', 'ActiveCampaign — 소기업용 이메일 마케팅·영업 자동화 CRM (v71aj ② 영업 보강, 앱스토어 1239908329)', 'https://activecampaign.com/', '1239908329', 'us:1239908329', '2:us|activecampaign', 1172),
  ('salesrabbit', 'SalesRabbit', 'SalesRabbit — 방문(현장) 영업팀용 영업 관리 앱 (v71aj ② 영업 보강, 앱스토어 879884387)', 'https://salesrabbit.com/', '879884387', 'us:879884387', '2:us|salesrabbit', 1169),
  ('justcall', 'JustCall', 'JustCall — 영업팀용 클라우드 전화·SMS 다이얼러 (v71aj ② 영업 보강, 앱스토어 1156351688)', 'https://justcall.io/', '1156351688', 'us:1156351688', '2:us|justcall', 1144),
  ('badger-maps', 'Badger Maps', 'Badger Maps — 현장 영업 담당자용 방문 경로·고객 지도 앱 (v71aj ② 영업 보강, 앱스토어 789934914)', 'https://badgermapping.com/', '789934914', 'us:789934914', '2:us|badger-maps', 1108),
  ('bigin', 'Bigin', 'Bigin — Zoho 의 소기업·1인 사업자용 파이프라인 CRM(Bigin by Zoho CRM) (v71aj ② 영업 보강, 앱스토어 1454212098)', 'https://zoho.com/', '1454212098', 'us:1454212098', '2:us|bigin', 962),
  ('dynamics-365-sales', 'Dynamics 365 Sales', 'Dynamics 365 Sales — Microsoft 의 영업 CRM 모바일 앱 (v71aj ② 영업 보강, 앱스토어 1485578688)', 'https://dynamics.microsoft.com/', '1485578688', 'us:1485578688', '2:us|dynamics-365-sales', 854),
  ('pipedrive', 'Pipedrive', 'Pipedrive — 중소 영업팀용 파이프라인 중심 영업 CRM (v71aj ② 영업 보강, 앱스토어 921456160)', 'https://pipedrive.com/', '921456160', 'us:921456160', '2:us|pipedrive', 675),
  ('salesmate', 'Salesmate', 'Salesmate — 중소 영업팀용 영업 CRM (v71aj ② 영업 보강, 앱스토어 1114709439)', 'https://salesmate.io/', '1114709439', 'us:1114709439', '2:us|salesmate', 632),
  ('nimble', 'Nimble', 'Nimble — 개인·소규모 팀용 관계 관리 영업 CRM (v71aj ② 영업 보강, 앱스토어 651636273)', 'https://nimble.com/', '651636273', 'us:651636273', '2:us|nimble', 619),
  ('freshsales', 'Freshsales', 'Freshsales — Freshworks 의 영업 CRM (v71aj ② 영업 보강, 앱스토어 1073125057)', 'https://freshworks.com/', '1073125057', 'us:1073125057', '2:us|freshsales', 523),
  ('map-my-customers', 'Map My Customers', 'Map My Customers — 현장 영업용 고객 지도·방문 경로 CRM (v71aj ② 영업 보강, 앱스토어 953610296)', 'https://mapmycustomers.me/', '953610296', 'us:953610296', '2:us|map-my-customers', 468),
  ('copper', 'Copper', 'Copper — Google Workspace 연동 영업 CRM (v71aj ② 영업 보강, 앱스토어 941438829)', 'https://copper.com/', '941438829', 'us:941438829', '2:us|copper', 446),
  ('daylite', 'Daylite', 'Daylite — 소기업용 CRM·영업 파이프라인(Apple 기기용) (v71aj ② 영업 보강, 앱스토어 965269916)', 'https://daylite.app/', '965269916', 'us:965269916', '2:us|daylite', 438),
  ('onepagecrm', 'OnePageCRM', 'OnePageCRM — 다음 행동 중심의 소기업용 영업 CRM (v71aj ② 영업 보강, 앱스토어 692777054)', 'https://onepagecrm.com/', '692777054', 'us:692777054', '2:us|onepagecrm', 384),
  ('aircall', 'Aircall', 'Aircall — 영업·지원팀용 클라우드 전화(통화 기록·CRM 연동) (v71aj ② 영업 보강, 앱스토어 1021338425)', 'https://aircall.io/', '1021338425', 'us:1021338425', '2:us|aircall', 338),
  ('insightly', 'Insightly', 'Insightly — 중소기업용 영업 CRM (v71aj ② 영업 보강, 앱스토어 563017797)', 'https://insightly.com/', '563017797', 'us:563017797', '2:us|insightly', 293),
  ('linkedin-sales-navigator', 'LinkedIn Sales Navigator', 'LinkedIn Sales Navigator — LinkedIn 의 리드 발굴·영업 탐색 도구 (v71aj ② 영업 보강, 앱스토어 910768078)', 'https://business.linkedin.com/', '910768078', 'kr:910768078', '2:linkedin-sales-navigator', 244),
  ('streak', 'Streak', 'Streak — Gmail 안에서 쓰는 영업 파이프라인 CRM (v71aj ② 영업 보강, 앱스토어 674067680)', 'https://streak.com/', '674067680', 'us:674067680', '2:us|streak', 160),
  ('repsly', 'Repsly', 'Repsly — 현장 영업·리테일 실행 관리 앱 (v71aj ② 영업 보강, 앱스토어 1629889716)', 'https://repsly.com/', '1629889716', 'us:1629889716', '2:us|repsly', 106),
  ('nutshell', 'Nutshell', 'Nutshell — 소기업용 영업 CRM·영업 자동화 (v71aj ② 영업 보강, 앱스토어 337938121)', 'https://nutshell.com/', '337938121', 'us:337938121', '2:us|nutshell', 85),
  ('nocrm', 'noCRM.io', 'noCRM.io — 리드 관리 중심의 소규모 영업팀용 도구 (v71aj ② 영업 보강, 앱스토어 1079498089)', 'https://nocrm.io/', '1079498089', 'us:1079498089', '2:us|nocrm', 59),
  ('close', 'Close', 'Close — 소규모 영업팀용 통화·이메일 내장 영업 CRM (v71aj ② 영업 보강, 앱스토어 1668836284)', 'https://close.com/', '1668836284', 'us:1668836284', '2:us|close', 52)
;

DO $$
DECLARE running_at text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = 'appstore' AND s.enabled) THEN RAISE EXCEPTION 'appstore 소스가 꺼져 있거나 없다'; END IF;
  IF to_regclass('public.review_targets_window_batch_20261017') IS NOT NULL THEN
    RAISE EXCEPTION '순서 위반: #554(20261017000020) 가 먼저 적용됐다 — #554 롤백 뒤 이 파일 → #554 순으로 다시';
  END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key = 'appstore' AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

-- 게이트 허용 N(적용 시점 실측). #554 와 같은 식.
CREATE TEMP TABLE _sa_gate ON COMMIT DROP AS
SELECT a.as_active, a.total_active, a.gp_active,
       GREATEST(0, floor((0.3 * a.total_active - a.as_active) / 0.7))::int AS n_allowed
  FROM (SELECT count(*) FILTER (WHERE t.source_key = 'appstore')::int AS as_active,
               count(*)::int AS total_active,
               count(*) FILTER (WHERE t.source_key = 'googleplay')::int AS gp_active
          FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
         WHERE t.status = 'active') a;

-- 이름 키 = 소개문 앞 이름 정규화(candidate-register 와 같은 식).
CREATE TEMP TABLE _sa_skip ON COMMIT DROP AS
SELECT DISTINCT n.slug, 'app_id_exists' AS why FROM _sa_new n
 WHERE EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'appstore' AND split_part(t.product_ref, ':', 2) = n.app_id)
UNION
SELECT DISTINCT n.slug, 'project_name_exists' FROM _sa_new n
 WHERE EXISTS (SELECT 1 FROM public.analysis_projects p
                WHERE regexp_replace(lower(regexp_replace(substring(p.product_elevator_pitch from '^(.{2,40}?)\s(?:—|\()'), '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g')
                    = regexp_replace(lower(regexp_replace(n.name, '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g'));

CREATE TEMP TABLE _sa_pick ON COMMIT DROP AS
SELECT n.* FROM (
  SELECT n.*, row_number() OVER (ORDER BY n.ratings DESC, n.product_ref) AS rk
    FROM _sa_new n WHERE n.slug NOT IN (SELECT slug FROM _sa_skip)
) n, _sa_gate g
WHERE n.rk <= g.n_allowed;

-- 뽑힌 앱만 프로젝트를 만든다.
CREATE TEMP TABLE _sa_proj ON COMMIT DROP AS
SELECT DISTINCT slug, name, pitch, competitor_url, NULL::uuid AS project_id FROM _sa_pick;
WITH ins AS (
  INSERT INTO public.analysis_projects
    (competitor_url, product_elevator_pitch, purpose, status, mode, business_model, area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
  SELECT p.competitor_url, p.pitch, 'product_fit', 'collecting', 'forward', 'SAAS', '2', 'manual', 'manual:sales-v71aj:' || p.slug, 'sales-v71aj', now()
    FROM _sa_proj p
  RETURNING id, product_elevator_pitch
)
UPDATE _sa_proj p SET project_id = ins.id FROM ins WHERE ins.product_elevator_pitch = p.pitch;

CREATE TABLE IF NOT EXISTS public.review_targets_sales_batch_20261017 (
  target_id uuid PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL, slug text NOT NULL, source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL,
  ratings int NOT NULL, inserted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_targets_sales_batch_20261017 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.review_targets_sales_batch_20261017 IS
  '20261017000010_sales_appstore_targets_20261017 이 넣은 ② 영업 앱스토어 타깃(게이트 한도 안). 롤백이 이걸 읽는다. 롤백 후에는 지워도 된다.';

WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT j.project_id, 'appstore', p.product_ref, p.label, 'active', NULL, NULL
    FROM _sa_pick p JOIN _sa_proj j USING (slug)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, project_id, product_ref, label
)
INSERT INTO public.review_targets_sales_batch_20261017 (target_id, project_id, slug, source_key, product_ref, label, ratings)
SELECT i.id, i.project_id, p.slug, 'appstore', i.product_ref, i.label, p.ratings
  FROM ins i JOIN _sa_pick p USING (product_ref);

DO $$
DECLARE ins int; n_allowed int; gp_before int; gp_after int; as_active int; total_active int; orphan int; proj int; skipped text; cand int; eligible int; gated int; gated_list text;
BEGIN
  SELECT count(*) INTO ins FROM public.review_targets_sales_batch_20261017 WHERE inserted_at = now();
  SELECT g.n_allowed, g.gp_active INTO n_allowed, gp_before FROM _sa_gate g;
  IF ins > n_allowed THEN RAISE EXCEPTION '삽입 %행 > 게이트 허용 %행', ins, n_allowed; END IF;
  SELECT count(*) INTO orphan FROM _sa_proj WHERE project_id IS NULL;
  IF orphan > 0 THEN RAISE EXCEPTION '프로젝트를 못 만든 앱 %개', orphan; END IF;
  SELECT count(*) INTO gp_after FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF gp_after > gp_before THEN RAISE EXCEPTION '구글 플레이 활성 % → % (이 마이그는 앱스토어만 넣는다)', gp_before, gp_after; END IF;
  SELECT count(*) FILTER (WHERE t.source_key = 'appstore'), count(*) INTO as_active, total_active
    FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled WHERE t.status = 'active';
  IF ins > 0 AND as_active > 0.3 * total_active THEN RAISE EXCEPTION '앱스토어 활성 %/% > 0.3', as_active, total_active; END IF;
  SELECT count(*) INTO proj FROM _sa_proj;
  SELECT string_agg(slug || '(' || why || ')', ', ' ORDER BY slug) INTO skipped FROM _sa_skip;
  SELECT count(*) INTO cand FROM _sa_new;
  SELECT count(*) INTO eligible FROM _sa_new n WHERE n.slug NOT IN (SELECT slug FROM _sa_skip);
  SELECT count(*), string_agg(n.label, ', ' ORDER BY n.ratings DESC, n.product_ref) INTO gated, gated_list
    FROM _sa_new n WHERE n.slug NOT IN (SELECT slug FROM _sa_skip) AND n.product_ref NOT IN (SELECT product_ref FROM _sa_pick);
  RAISE NOTICE 'sales batch: 후보 %행 · 건너뜀(중복) %행 · 게이트 허용 % · 삽입 %행 · 게이트로 막힘 %행',
    cand, cand - eligible, n_allowed, ins, gated;
  RAISE NOTICE 'sales batch: 새 프로젝트 % · 건너뜀 % · appstore 활성 %/% · #554 에 남는 칸 %',
    proj, coalesce(skipped, '-'), as_active, total_active, GREATEST(0, floor((0.3 * total_active - as_active) / 0.7))::int;
  IF gated > 0 THEN RAISE NOTICE 'sales batch: 게이트로 막힌 행(다음 분할 대상) = %', gated_list; END IF;
END $$;

COMMIT;
