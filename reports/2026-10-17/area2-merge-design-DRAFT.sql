-- ============================================================
-- ⛔⛔ 초안 — 적용 금지. 3일 판정(reports/2026-10-17/area2-daily-approvals.sql [2])이 '미달' 일 때만 CEO-staff 가 쓴다.
--    supabase/migrations/ 에 두지 않은 것은 일부러다(db push·자동 적용 경로에서 빠지게). 쓰기로 하면 그날 번호로 옮긴다.
--
-- v71ad §2 — ② 영업을 design 에 합친다(남헌: 3일 뒤 ② 승인 증가 하루 50건 미만이면 design(③)에 합친다).
--   ⚠️ 합칠 영역 코드가 지시서에서 갈린다 — "design(③)". DB 어휘에서 design 과 3(③ 마케팅)은 다른 코드다.
--      아래 :into 한 곳(_m2_into)만 'design' ↔ '3' 으로 바꾸면 된다. 사람 판단 항목으로 올렸다.
--
-- 무엇을: analysis_projects 에서 area_code='2' 인 행의 영역 칸 5개만 바꾼다(area_code·area_basis='manual'·area_evidence 앞에
--   'merged-from-2:' · area_rule_ver='merge-2-v71ad' · area_assigned_at). 바뀌기 전 값은 기록 표에 남기고 롤백이 그대로 되돌린다.
--   DELETE·DROP 없음. analysis_inputs·review_relevance_verdicts·승인 값은 안 건드린다(입력 영역은 뷰 v_input_area 가 프로젝트 값을 따라간다).
-- 안 하는 것(일부러):
--   · review_targets.label 의 '2:' 접두 — 'design' 은 라벨 접두 어휘(^[1-5]:)에 없다. 라벨을 그대로 두면 target-supply 대시보드·
--     창문 발굴은 계속 ② 로 센다(프로젝트 영역과 라벨 영역이 갈린다 — 아래 [B] 참고). '3' 으로 합치기로 하면 [B] 블록을 쓴다.
--   · config/areas.json 의 "2" active=false — 셀프테스트(scripts/areas-selftest.mjs) 기대값 5개가 같이 바뀌어야 해서 이 초안에 넣지 않았다
--     (같이 바꾸는 PR 이 따로 필요. 안 바꾸면 ② 는 판정 최소량 200 의 '결손 영역' 으로 계속 뜬다 — 프로젝트 0 이라 공급 부족 칸, 해는 없음).
-- §10.2: 대량 UPDATE(예외 2번) — 4조건(드라이런=아래 [전]·롤백=_rollback·무중단·Notion 기록) 충족 시 세션 자율. 단 '영역을 끄는 것은 남헌 판단'
--   (config/areas.json _areas) 이라 3일 판정 결과를 근거로 남헌 조건부 지시를 집행하는 것임을 Notion 에 적는다.
-- ============================================================

-- [전 1] 합치기 전 영역별 숫자(프로젝트·입력·판정·승인). 적용 직후 [후 1] 과 나란히 본다.
SELECT coalesce(p.area_code, '(미부여)') AS area, count(*) AS projects,
       sum(x.inputs) AS inputs, sum(x.judged) AS judged, sum(x.approved) AS approved, sum(x.active_targets) AS active_targets
  FROM public.analysis_projects p
  CROSS JOIN LATERAL (SELECT
         (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = p.id) AS inputs,
         (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id = p.id) AS judged,
         (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id = p.id
             AND (v.human_verdict = 'relevant' OR (v.human_verdict IS NULL AND v.auto_approved_at IS NOT NULL))) AS approved,
         (SELECT count(*) FROM public.review_targets t WHERE t.project_id = p.id AND t.status = 'active') AS active_targets) x
 GROUP BY 1 ORDER BY 1;

-- [전 2] 바뀔 행 수와 manual 행(사람이 정한 영역) 수 — manual 도 합친다(롤백이 기록 표로 되돌린다).
SELECT count(*) AS to_merge, count(*) FILTER (WHERE area_basis = 'manual') AS manual_rows,
       count(*) FILTER (WHERE area_rule_ver = 'sales-v71ad') AS from_pr559
  FROM public.analysis_projects WHERE area_code = '2';

-- [A] 정방향 ------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _m2_into ON COMMIT DROP AS SELECT 'design'::text AS code;   -- ← 'design' 또는 '3'. 여기 한 곳만 바꾼다.

CREATE TABLE IF NOT EXISTS public.area_merge_2_v71ad (
  project_id uuid PRIMARY KEY REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  prev_area_code text NOT NULL, prev_area_basis text, prev_area_evidence text, prev_area_rule_ver text, prev_area_assigned_at timestamptz,
  merged_into text NOT NULL, merged_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.area_merge_2_v71ad ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.area_merge_2_v71ad IS 'v71ad ② → design 합치기 전 영역 값. 롤백이 이걸 읽는다.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.area_merge_2_v71ad) THEN RAISE EXCEPTION '기록 표가 비어 있지 않다 — 이미 합쳤거나 이전 시도가 남았다'; END IF;
  IF (SELECT code FROM _m2_into) NOT IN ('design', '3') THEN RAISE EXCEPTION '합칠 영역은 design 또는 3 만'; END IF;
END $$;

INSERT INTO public.area_merge_2_v71ad (project_id, prev_area_code, prev_area_basis, prev_area_evidence, prev_area_rule_ver, prev_area_assigned_at, merged_into)
SELECT p.id, p.area_code, p.area_basis, p.area_evidence, p.area_rule_ver, p.area_assigned_at, (SELECT code FROM _m2_into)
  FROM public.analysis_projects p WHERE p.area_code = '2';

UPDATE public.analysis_projects p
   SET area_code = m.merged_into, area_basis = 'manual', area_evidence = 'merged-from-2:' || coalesce(m.prev_area_evidence, ''),
       area_rule_ver = 'merge-2-v71ad', area_assigned_at = now()
  FROM public.area_merge_2_v71ad m
 WHERE p.id = m.project_id;

DO $$
DECLARE left2 int; rec int; moved int;
BEGIN
  SELECT count(*) INTO left2 FROM public.analysis_projects WHERE area_code = '2';
  SELECT count(*) INTO rec FROM public.area_merge_2_v71ad;
  SELECT count(*) INTO moved FROM public.analysis_projects WHERE area_rule_ver = 'merge-2-v71ad';
  IF left2 <> 0 THEN RAISE EXCEPTION '② 가 %행 남았다', left2; END IF;
  IF moved <> rec THEN RAISE EXCEPTION '옮긴 % ≠ 기록 %', moved, rec; END IF;
  RAISE NOTICE 'area merge: ② % 프로젝트 → %', rec, (SELECT code FROM _m2_into);
END $$;

COMMIT;

-- [B] (선택 — '3' 으로 합칠 때만) 타깃 라벨 접두 '2:' → '3:'. design 이면 쓰지 않는다(라벨 어휘에 design 이 없다).
--     기록 표 public.review_targets_relabel_2_v71ad 에 이전 라벨을 남긴다. (source_key, label) 중복이 생기면 RAISE.
-- BEGIN;
-- CREATE TABLE IF NOT EXISTS public.review_targets_relabel_2_v71ad (target_id uuid PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE, prev_label text NOT NULL, relabeled_at timestamptz NOT NULL DEFAULT now());
-- ALTER TABLE public.review_targets_relabel_2_v71ad ENABLE ROW LEVEL SECURITY;
-- INSERT INTO public.review_targets_relabel_2_v71ad (target_id, prev_label) SELECT id, label FROM public.review_targets WHERE label LIKE '2:%';
-- UPDATE public.review_targets t SET label = '3:' || substr(t.label, 3) FROM public.review_targets_relabel_2_v71ad r WHERE t.id = r.target_id;
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM public.review_targets WHERE label LIKE '2:%') THEN RAISE EXCEPTION '2: 라벨이 남았다'; END IF;
--   IF EXISTS (SELECT source_key, label FROM public.review_targets GROUP BY 1, 2 HAVING count(*) > 1) THEN RAISE EXCEPTION '라벨 중복'; END IF;
-- END $$;
-- COMMIT;

-- [후 1] 합친 뒤 영역별 숫자 — [전 1] 과 같은 쿼리. 기대: '2' 행 없음, design(또는 3) 의 projects·inputs·judged·approved 가 [전 1] ② 만큼 늘고 합계 불변.
SELECT coalesce(p.area_code, '(미부여)') AS area, count(*) AS projects,
       sum(x.inputs) AS inputs, sum(x.judged) AS judged, sum(x.approved) AS approved, sum(x.active_targets) AS active_targets
  FROM public.analysis_projects p
  CROSS JOIN LATERAL (SELECT
         (SELECT count(*) FROM public.analysis_inputs i WHERE i.project_id = p.id) AS inputs,
         (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id = p.id) AS judged,
         (SELECT count(*) FROM public.review_relevance_verdicts v WHERE v.project_id = p.id
             AND (v.human_verdict = 'relevant' OR (v.human_verdict IS NULL AND v.auto_approved_at IS NOT NULL))) AS approved,
         (SELECT count(*) FROM public.review_targets t WHERE t.project_id = p.id AND t.status = 'active') AS active_targets) x
 GROUP BY 1 ORDER BY 1;

-- [후 2 음성] 합치기 대상 밖 프로젝트의 영역 값은 그대로 — 기록 표 밖에서 area_rule_ver='merge-2-v71ad' 인 행 0.
SELECT count(*) FROM public.analysis_projects p
 WHERE p.area_rule_ver = 'merge-2-v71ad' AND NOT EXISTS (SELECT 1 FROM public.area_merge_2_v71ad m WHERE m.project_id = p.id);   -- 기대: 0
