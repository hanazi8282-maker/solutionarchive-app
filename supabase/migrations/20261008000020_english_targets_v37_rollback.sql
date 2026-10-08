-- ============================================================
-- 20261008000020_english_targets_v37 — ROLLBACK
--
-- 실행은 오케스트레이터 판단. 무엇을 되돌리나:
--   A (기본, 아래 BEGIN~COMMIT) — 되돌릴 수 있는 형태만:
--     1) 이 마이그가 넣은 신규 타깃 52행 → status='failed'. failed 는 planRevive 가 되살리지 않는다(자동 부활 없음).
--        식별자 = 정확한 (source_key, product_ref) 52쌍. LIKE 패턴을 쓰지 않는다 — PR #464 us:en 8행을 건드리지 않기 위해서.
--     2) 맞바꾸기로 내린 googleplay kr:ko 22행 → status='active'(마이그가 바꾼 열은 status 하나뿐이라 그것만 되돌린다).
--        조건 status='exhausted' — 그 사이 다른 이유로 failed 가 된 행은 건드리지 않는다.
--     결과: googleplay 활성 = 적용 전과 같은 수(신규 22 내림 · 원래 22 올림), appstore 신규 30 은 failed.
--   B (주석) — 완전 삭제: 신규 타깃 52행 DELETE + 이 마이그가 만든 빈 프로젝트 DELETE.
--     §10.2 예외 1번(데이터 DELETE)이라 사람 판단. A 로 충분한지 먼저 본다.
--     수집된 리뷰(analysis_inputs)는 target id 칸이 없어 남는다(project_id 로만 묶인다) — 프로젝트를 지우면 CASCADE 로 같이 지워지므로
--     B 의 프로젝트 DELETE 는 입력 0건인 프로젝트만 대상으로 한다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _v37_new_rb (source_key text NOT NULL, product_ref text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _v37_new_rb (source_key, product_ref) VALUES
  ('googleplay', 'us:en:com.clari'), ('googleplay', 'us:en:io.outreach.sales'), ('googleplay', 'us:en:com.salesloftmobile'),
  ('googleplay', 'us:en:com.zoominfo.enterprise'), ('googleplay', 'us:en:com.highspot.Highspot'), ('googleplay', 'us:en:ai.instantly.app'),
  ('googleplay', 'us:en:com.hubspot.android'),
  ('appstore', 'us:1289289459'), ('appstore', 'us:977304452'), ('appstore', 'us:1455032473'), ('appstore', 'us:1493170277'),
  ('appstore', 'us:1173751523'), ('appstore', 'us:6474658497'), ('appstore', 'us:1107711722'),
  ('googleplay', 'us:en:ai.adcreative.m'), ('googleplay', 'us:en:co.foreplay.ForeplayMobile'), ('googleplay', 'us:en:co.simplified.main'),
  ('googleplay', 'us:en:com.predis.app'),
  ('appstore', 'us:6740659906'), ('appstore', 'us:6466097243'), ('appstore', 'us:6738098343'), ('appstore', 'us:1610971740'),
  ('appstore', 'us:6450264767'),
  ('googleplay', 'us:en:com.fifteenfive.fifteenfiveapp'), ('googleplay', 'us:en:com.lattice'),
  ('appstore', 'us:1020253220'), ('appstore', 'us:1409785530'),
  ('googleplay', 'us:en:com.grammarly.android.keyboard'), ('googleplay', 'us:en:com.quillbot.mobile'), ('googleplay', 'us:en:notion.id'),
  ('googleplay', 'us:en:com.craft.docs'), ('googleplay', 'us:en:com.humanplusplus.sudowrite'), ('googleplay', 'us:en:app.gamma.mobile'),
  ('googleplay', 'us:en:com.gingersoftware.android.keyboard'), ('googleplay', 'kr:ko:com.wrtn.app'), ('googleplay', 'kr:ko:com.infraware.office.link'),
  ('appstore', 'us:1158877342'), ('appstore', 'us:6463116243'), ('appstore', 'us:1628773284'), ('appstore', 'us:1232780281'),
  ('appstore', 'us:1487937127'), ('appstore', 'us:6740884542'), ('appstore', 'us:6768404578'), ('appstore', 'us:822797943'),
  ('appstore', 'kr:1158877342'), ('appstore', 'kr:6463116243'), ('appstore', 'kr:1232780281'), ('appstore', 'kr:1487937127'),
  ('appstore', 'kr:6768404578'), ('appstore', 'kr:822797943'), ('appstore', 'kr:6448556170'), ('appstore', 'kr:698070860');

CREATE TEMP TABLE _v37_swap_rb (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _v37_swap_rb (id) VALUES
  ('325be79c-21c3-46eb-abbf-333052878d66'), ('7460dec5-43a3-4858-8378-0ed61bb41b90'), ('a1381ea4-ed54-4a0c-b077-501abeb51e33'),
  ('3b8f357e-fbb9-4248-8d36-0af3ff3c7e1b'), ('c6f210b5-ce6e-4b73-b401-6003d79a01bf'), ('1af25224-787b-453d-add7-487497c05984'),
  ('b9099479-489a-42f1-8912-2e3a32e1030e'), ('127cdff1-492a-4914-9b57-00462105abe2'), ('f8b6d2f3-fff2-469b-800a-c24a030de10a'),
  ('37907d10-b433-476e-a6a5-0903ddaa7274'), ('34a2fddc-00d8-45f2-aee8-e3a2ff623070'), ('e6df374f-7153-4993-8110-ee3fff2324fd'),
  ('34031838-b921-4705-ac52-25165821c6d1'), ('9e2ca9a0-1a48-48a7-bffd-72c91689bcc4'), ('8953630a-7199-4bea-8fd1-5043f274cce6'),
  ('b392c930-895f-439d-bdfa-639c28030eb6'), ('fa534580-7ae3-4e5f-ab69-0556d3c27914'), ('7216d264-0b80-4af3-9ece-1d59454566de'),
  ('48ef8d40-2441-4f52-a94a-895da9ecdbb1'), ('c66f3f63-2bc7-43b3-9271-cd51630c974b'), ('d69b4673-7b7c-4927-8689-59d8b5b0775c'),
  ('404123b9-3ba0-487f-8e48-15f7b175d215');

CREATE TEMP TABLE _v37_rb_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

UPDATE public.review_targets t SET status = 'failed'
  FROM _v37_new_rb r
 WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref AND t.status <> 'failed';

UPDATE public.review_targets t SET status = 'active'
  FROM _v37_swap_rb s
 WHERE t.id = s.id AND t.source_key = 'googleplay' AND t.status = 'exhausted';

DO $$
DECLARE still int; down int; n_new int; n_swap int; gp_before int; gp_after int;
BEGIN
  SELECT count(*) INTO n_new FROM _v37_new_rb;
  SELECT count(*) INTO n_swap FROM _v37_swap_rb;
  IF (n_new, n_swap) <> (52, 22) THEN RAISE EXCEPTION '입력 개수 new % · swap %(기대 52·22)', n_new, n_swap; END IF;
  SELECT count(*) INTO still FROM public.review_targets t JOIN _v37_new_rb r ON t.source_key = r.source_key AND t.product_ref = r.product_ref
   WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '신규 타깃 %행이 아직 failed 가 아니다', still; END IF;
  SELECT count(*) INTO down FROM public.review_targets t JOIN _v37_swap_rb s ON s.id = t.id WHERE t.status <> 'active';
  IF down <> 0 THEN RAISE NOTICE '맞바꾼 행 %개가 active 로 안 돌아왔다(그 사이 failed 등 다른 상태 — 손대지 않음)', down; END IF;
  SELECT n INTO gp_before FROM _v37_rb_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  RAISE NOTICE 'v37 롤백 A: googleplay 활성 % → % · 신규 failed % · 복귀 대상 %', gp_before, gp_after, n_new, n_swap;
END $$;

COMMIT;

-- ── B. 완전 삭제(주석 — 사람 판단, §10.2 예외 1번) ───────────────
-- BEGIN;
-- DELETE FROM public.review_targets t USING (VALUES <위 52쌍>) r(source_key, product_ref)
--  WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref;
-- DELETE FROM public.analysis_projects a
--  WHERE a.product_elevator_pitch ~ '^(Grammarly|QuillBot|Wordtune|Notion AI|Craft|Sudowrite|Gamma|Ginger|Wrtn|Polaris Office AI) \('
--    AND a.status = 'collecting'
--    AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.project_id = a.id)
--    AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = a.id);
-- COMMIT;

-- 확인(A 후):
-- SELECT status, count(*) FROM public.review_targets t JOIN (VALUES ('googleplay','us:en:com.clari')) v(s,r) ON t.source_key=v.s AND t.product_ref=v.r GROUP BY 1;  -- 예: failed 1
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';   -- 기대: 마이그 적용 전과 같음(88)
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%' AND status='active';  -- 기대: 8(PR #464 행만)
