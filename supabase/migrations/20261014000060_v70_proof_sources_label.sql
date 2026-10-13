-- ============================================================
-- 20261014000060_v70_proof_sources_label — v70 포럼 소스 6곳을 "기계 동작 증명용" 으로 표시하고 분석에서 제외한다
--
-- 근거: 제1참모 L-33 결정 B(2026-10-14) — "영역 적합성 필수. 이미 모은 6개 포럼은 삭제하지 말고 '기계 동작 증명용' 라벨을 붙여 분석에서 제외."
-- 무엇: (1) review_sources.display_name 앞에 '[기계 동작 증명용] ' (2) 이번 세션이 만든 프로젝트 4개(Make·Bubble·Glide·Softr)의 area_code 를
--   NULL(미부여) → 'out-founder'(영역 외 태그, in_scope=false)로, 근거 area_basis='manual'·area_rule_ver='v70-proof'. n8n·Retool 프로젝트는 이미 out-founder(v37-1)라 건드리지 않는다.
-- 삭제 0 · 수집분 0건 변경 · 수집은 계속(24시간 관찰이 C3 조건). 영역 외 칸은 판정 우선순위가 맨 뒤라(lib/analysis/area-priority.ts) 분석·판정 예산을 먹지 않는다.
-- 🟢 비파괴·멱등(WHERE area_code IS NULL / display_name NOT LIKE). 본 세션이 만든 행만 대상 — 기존 이벤트·타 프로젝트 UPDATE 없음.
-- 롤백: 20261014000060_v70_proof_sources_label_rollback.sql
-- ============================================================

BEGIN;

UPDATE public.review_sources
   SET display_name = '[기계 동작 증명용] ' || display_name
 WHERE key IN ('n8n_community','make_community','bubble_forum','retool_community','glide_community','softr_community')
   AND display_name NOT LIKE '[기계 동작 증명용]%';

UPDATE public.analysis_projects
   SET area_code = 'out-founder',
       area_basis = 'manual',
       area_rule_ver = 'v70-proof',
       area_assigned_at = now()
 WHERE id IN ('d8bd112e-3597-466f-b9dd-7cbc599c27b5',   -- Bubble
              'b7214981-4924-4494-a631-d1188285343a',   -- Glide
              '555f1d90-b267-4c31-936d-dc635b9b51a4',   -- Make
              '514d2dcc-9fc4-4522-9509-30c611b6c466')   -- Softr
   AND area_code IS NULL;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key IN ('n8n_community','make_community','bubble_forum','retool_community','glide_community','softr_community') AND display_name LIKE '[기계 동작 증명용]%';
  IF n <> 6 THEN RAISE EXCEPTION '증명용 표시된 소스 % 개(기대 6)', n; END IF;
  SELECT count(*) INTO n FROM public.analysis_projects
   WHERE id IN ('d8bd112e-3597-466f-b9dd-7cbc599c27b5','b7214981-4924-4494-a631-d1188285343a','555f1d90-b267-4c31-936d-dc635b9b51a4','514d2dcc-9fc4-4522-9509-30c611b6c466')
     AND area_code = 'out-founder' AND area_rule_ver = 'v70-proof';
  IF n <> 4 THEN RAISE EXCEPTION 'out-founder 로 표시된 신규 프로젝트 % 개(기대 4)', n; END IF;
END $$;

COMMIT;

-- 적용 후 확인:
--   SELECT key, display_name, enabled FROM public.review_sources WHERE key IN ('n8n_community','make_community','bubble_forum','retool_community','glide_community','softr_community') ORDER BY key;
--   SELECT left(product_elevator_pitch,24), area_code, area_basis, area_rule_ver FROM public.analysis_projects WHERE area_rule_ver = 'v70-proof';
