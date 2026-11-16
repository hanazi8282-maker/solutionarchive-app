-- ============================================================
-- 20261116000002_github_payments_targets_3 — v71cp: github_issues 결제·정산·회계(areas_v2 priority 2) 오픈소스 3곳 등재
--
-- ⛔ 코드(lib/review/adapters/github.ts REPOS 3곳 추가)가 main 에 머지된 **뒤** 적용한다(없으면 어댑터가 slug 를 몰라 조용히 안 돈다).
-- 근거: 2026-11-16 GitHub Search 실측(공식 API, 최근 30일 이슈 건수) bigcapital 45 · invoiceshelf 17 · akaunting 9. 합 약 71건/30일(≈2.4/일) — 얇다.
--   10/19 측정에서 akaunting 은 0.06/일로 제외됐으나 최근 30일 9건(0.3/일)으로 올랐다. lago 3·killbill 2·orangehrm(HR) 2·icehrm(HR) 1 은 월 3건 이하라 넣지 않는다.
--   HR·영업 오픈소스는 기존 frappe-hrms·kimai·twenty·espocrm·frappe-crm·krayin·suitecrm 이 이미 있고 신규 후보는 월 2건 이하로 실익이 없다.
-- 영역: analysis_projects.area_code 어휘(①~⑤·design·notes)에 결제가 없다 → NULL + area_evidence 'hold:payments_billing_accounting(areas_v2)' (candidate-register-draft hold 규칙).
-- 약관·robots: github_issues 소스 행 라벨 그대로(공식 API). 새 법적 리스크 없음. HN 비중을 올리지 않는다.
-- 🟢 비파괴·멱등. INSERT 만(같은 pitch·같은 source_key+product_ref 가 있으면 건너뜀). 기존 행 변경·삭제·DDL 없음.
-- 롤백: 20261116000002_github_payments_targets_3_rollback.sql
-- ============================================================
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'github_issues' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'github_issues 가 없거나 enabled=false — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _gh (ref text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _gh (ref, label, pitch, url) VALUES
  ('board:bigcapital', 'pay:gh|bigcapital', 'Bigcapital — 오픈소스 회계·장부·청구', 'https://bigcapital.app/'),
  ('board:invoiceshelf', 'pay:gh|invoiceshelf', 'InvoiceShelf — 오픈소스 청구서·견적·결제 기록', 'https://invoiceshelf.com/'),
  ('board:akaunting', 'pay:gh|akaunting', 'Akaunting — 오픈소스 회계·청구·경비', 'https://akaunting.com/');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model,
                                      area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS',
       NULL, 'label', 'hold:payments_billing_accounting(areas_v2)', 'v71cp', now()
  FROM _gh g
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch)
 ORDER BY g.pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'github_issues', g.ref, g.label, NULL, 'active'
  FROM _gh g
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'github_issues' AND t.product_ref = g.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets t JOIN _gh g ON t.source_key = 'github_issues' AND t.product_ref = g.ref WHERE t.status = 'active';
  IF n <> 3 THEN RAISE EXCEPTION '타깃 % 개(기대 3)', n; END IF;
END $$;
COMMIT;
-- 적용 후: SELECT count(*) FROM review_targets WHERE source_key='github_issues' AND status='active'; -- 기대 43
