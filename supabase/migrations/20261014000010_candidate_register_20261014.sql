-- ============================================================
-- 20261014000010_candidate_register_20261014
--
-- ⛔ 미적용 초안 — scripts/candidate-register-draft.mjs 가 reports/2026-10-12/approved-notes.json 로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: 사람이 승인 시트에서 Y 한 제품 후보 4개를 등록한다. DELETE·DROP·DDL 0.
--   (1) analysis_projects INSERT(status='collecting', purpose='product_fit', mode='forward', business_model='SAAS')
--       area_basis='manual'(사람 결정 — 20261009000020 롤백이 건드리지 않는다) · area_rule_ver='cand-reg-v1' · area_evidence 아래.
--   (2) review_targets INSERT — 앵커가 있는 소스만(3행). review_sources·review_source_ramp(cap_base·램프)는 건드리지 않는다.
--   (3) 제품 사전 연결은 이 SQL 밖 — 생성기 콘솔 목록대로 사람이 reports/2026-10-05/product-dictionary 에 옮긴다.
--   (4) 중복 방지: 같은 정규화 키의 프로젝트(소개문 앞 이름을 normKey 와 같은 규칙으로 정규화)가 이미 있으면 새로 만들지 않고 그 프로젝트를 쓴다.
--       타깃은 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뛴다.
--       재사용한 기존 프로젝트의 영역 칸은 바꾸지 않는다(UPDATE 0 — 끝의 NOTICE 가 재사용 수를 낸다. 재사용이 있으면 그 행 영역은 사람이 본다).
--
-- 영역 'notes'(노트·지식관리, 남헌 v53 — 영역 ①~⑤ 밖) 3개: area_code CHECK(20261009000020) 어휘에 'notes' 가 없다.
--   새 DDL 대신 **area_code NULL + area_evidence 'notes:<키>' 접두 + 타깃 라벨 'notes:' 접두**로 쓴다.
--   ⚠️ v37-1 영역 소급(20261009000020)을 재실행하면 area_code IS NULL 인 이 행들도 대상이 된다(입력이 생기면 out-* 로 채워질 수 있다)
--      — 재실행 전에 area_evidence LIKE 'notes:%' 행을 제외할 것.
-- 영역 값 hold 규칙: 애매하면(영역 어휘 밖·빈 값) area_code NULL 로 두고 area_evidence 'hold:<사유>:<키>' 로 hold 사유를 기록한다(0개).
-- competitor_url(NOT NULL): 도메인 앵커가 없으면 'candidate:<키>' 자리표시 — 도메인을 지어내지 않는다.
-- 앵커 없음(수집 타깃은 앵커 확인 후): Apple Notes
-- 롤백: 20261014000010_candidate_register_20261014_rollback.sql
--
-- 적용 전 드라이런(읽기만):
--   SELECT p.id, p.product_elevator_pitch FROM public.analysis_projects p
--    WHERE regexp_replace(lower(regexp_replace(substring(p.product_elevator_pitch from '^(.{2,40}?)\s(?:—|\()'), '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g') IN ('hubspotcrm', 'evernote', 'applenotes', 'bear');   -- 기대: 0행(있으면 그 프로젝트를 재사용)
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _cr_new (
  norm_key text PRIMARY KEY, name_key text NOT NULL, name text NOT NULL, pitch text NOT NULL UNIQUE, competitor_url text NOT NULL,
  area_code text, area_evidence text NOT NULL, project_id uuid, created boolean NOT NULL DEFAULT false
) ON COMMIT DROP;
INSERT INTO _cr_new (norm_key, name_key, name, pitch, competitor_url, area_code, area_evidence) VALUES
  ('hubspotcrm', 'hubspotcrm', 'HubSpot CRM', 'HubSpot CRM — 승인 후보 등록(2026-10-14, ② 영업)', 'candidate:hubspotcrm', '2', 'manual:cand-reg-v1:hubspotcrm'),  -- 근거 input 0건
  ('evernote', 'evernote', 'Evernote', 'Evernote — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)', 'candidate:evernote', NULL, 'notes:evernote'),  -- 근거 input 0건
  ('applenotes', 'applenotes', 'Apple Notes', 'Apple Notes — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)', 'candidate:applenotes', NULL, 'notes:applenotes'),  -- 근거 input 0건
  ('bear', 'bear', 'Bear', 'Bear — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)', 'candidate:bear', NULL, 'notes:bear')  -- 근거 input 0건
;

-- (4) 이미 있는 프로젝트(소개문 앞 이름의 정규화 키 = 후보 키 또는 이름 키) → 재사용. 두 개 이상이면 21000 으로 멈춘다(사람이 고른다).
UPDATE _cr_new n SET project_id = (
  SELECT p.id FROM public.analysis_projects p WHERE regexp_replace(lower(regexp_replace(substring(p.product_elevator_pitch from '^(.{2,40}?)\s(?:—|\()'), '\.(co\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g') IN (n.norm_key, n.name_key));

-- (1) 프로젝트 — 없는 것만.
WITH ins AS (
  INSERT INTO public.analysis_projects
    (competitor_url, product_elevator_pitch, purpose, status, mode, business_model, area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
  SELECT n.competitor_url, n.pitch, 'product_fit', 'collecting', 'forward', 'SAAS', n.area_code, 'manual', n.area_evidence, 'cand-reg-v1', now()
    FROM _cr_new n
   WHERE n.project_id IS NULL
  RETURNING id, product_elevator_pitch
)
UPDATE _cr_new n SET project_id = ins.id, created = true FROM ins WHERE ins.product_elevator_pitch = n.pitch;

CREATE TEMP TABLE _cr_tgt (norm_key text NOT NULL, source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _cr_tgt (norm_key, source_key, product_ref, label) VALUES
  ('hubspotcrm', 'appstore', 'us:1107711722', '2:us|hubspot-crm'),
  ('evernote', 'appstore', 'us:281796108', 'notes:us|evernote'),
  ('bear', 'appstore', 'us:1016366447', 'notes:us|bear')
;

CREATE TEMP TABLE _cr_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

DO $$
DECLARE off_sources text; running_at text;
BEGIN
  SELECT string_agg(k, ',') INTO off_sources FROM (SELECT DISTINCT source_key AS k FROM _cr_tgt) v
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _cr_tgt) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

-- (2) 수집 타깃 — 앵커가 있는 소스만. 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뛴다(dictionary-targets 와 같은 멱등).
CREATE TEMP TABLE _cr_tgt_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, t.source_key, t.product_ref, t.label, 'active', NULL, NULL
    FROM _cr_tgt t JOIN _cr_new n USING (norm_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets x WHERE x.source_key = t.source_key AND x.product_ref = t.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _cr_tgt_ins SELECT id, source_key FROM ins;

DO $$
DECLARE gp_before int; gp_after int;
BEGIN
  SELECT n INTO gp_before FROM _cr_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before AND gp_after > 80 THEN
    RAISE EXCEPTION '구글 플레이 활성 % → % (동결선 80 초과) — 1:1 맞바꾸기 또는 사람 판단', gp_before, gp_after;
  END IF;
  RAISE NOTICE 'candidate targets: 삽입 %행(후보 3)', (SELECT count(*) FROM _cr_tgt_ins);
END $$;

DO $$
DECLARE orphan text; bad_area int; bad_notes int; created_n int;
BEGIN
  SELECT string_agg(norm_key, ',') INTO orphan FROM _cr_new WHERE project_id IS NULL;
  IF orphan IS NOT NULL THEN RAISE EXCEPTION '프로젝트 없음: %', orphan; END IF;
  SELECT count(*) INTO bad_area FROM _cr_new n JOIN public.analysis_projects p ON p.id = n.project_id
   WHERE n.created AND p.area_code IS DISTINCT FROM n.area_code;
  IF bad_area <> 0 THEN RAISE EXCEPTION '영역이 계획과 다르다 %행', bad_area; END IF;
  SELECT count(*) INTO bad_notes FROM _cr_new n JOIN public.analysis_projects p ON p.id = n.project_id
   WHERE n.created AND n.area_evidence LIKE 'notes:%' AND (p.area_code IS NOT NULL OR p.area_evidence NOT LIKE 'notes:%');
  IF bad_notes <> 0 THEN RAISE EXCEPTION 'notes 행이 area_code NULL + notes: 접두가 아니다 %행', bad_notes; END IF;
  SELECT count(*) INTO created_n FROM _cr_new WHERE created;
  RAISE NOTICE 'candidate register: 프로젝트 생성 % · 재사용 % (후보 4)', created_n, 4 - created_n;
END $$;

COMMIT;

-- 확인: SELECT id, product_elevator_pitch, status, area_code, area_basis, area_evidence, area_rule_ver FROM public.analysis_projects
--   WHERE area_rule_ver = 'cand-reg-v1' AND product_elevator_pitch IN ('HubSpot CRM — 승인 후보 등록(2026-10-14, ② 영업)', 'Evernote — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)', 'Apple Notes — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)', 'Bear — 승인 후보 등록(2026-10-14, 영역 외-노트·지식관리)');   -- 기대 4행
