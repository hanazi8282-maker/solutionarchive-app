-- ============================================================
-- 20261008000020_english_targets_v37
--
-- v37 작업 4·5 — 영어 스토어 타깃(②③④) + ⑤ 글쓰기 시험 암 타깃, 구글 플레이는 0건 kr:ko 타깃과 1:1 맞바꾸기.
-- 드라이런·근거: reports/2026-10-08/english-expansion-targets-dryrun.md (스토어 ID 실측 2026-10-08, 맞바꾸기 근거 컬럼).
-- 설계: reports/2026-10-08/english-expansion-design-v31.md §1-4 A안 · §1-5 라벨 · §2 ⑤ 시험.
--
-- 무엇을(전부 INSERT 또는 status 한 열 UPDATE — DELETE·DROP·타입 변경 없음):
--   1) analysis_projects 최대 10행 INSERT — ⑤ 글쓰기 10제품. 같은 pitch 행이 이미 있으면 만들지 않고 재사용한다
--      (pitch = scripts/dictionary-targets.mjs productPitch 와 같은 문자열 → 나중에 투입기를 돌려도 같은 프로젝트에 붙는다).
--      status='collecting' · purpose='product_fit' · mode='forward' · business_model='SAAS'(투입기 apply 와 같은 값).
--   2) review_targets 52행 INSERT — googleplay 22 · appstore 30. status='active', last_run_at=NULL(미방문 = 다음 실행 앞순위 —
--      ② 최우선·⑤ 3일 시험을 위해. PR #464 의 now()(저우선) 와 의도가 다르다). 프로젝트는 같은 제품의 기존 kr 타깃 프로젝트(앵커),
--      없으면 1) 의 pitch 프로젝트.
--   3) review_targets 22행 status 'active'→'exhausted' — googleplay kr:ko · total_collected=0 · 방문함(last_run_at NOT NULL).
--      순서: consecutive_empty DESC → last_run_at ASC → id. 미방문은 후보에서 뺐다. 다른 열은 안 바꾼다.
--      googleplay 신규 22 = 내리는 22 → 활성 수 순변화 0(88 → 88). PR #464 일회성 예외(us:en 8행)를 뺀 활성 = 80 → 80.
--      exhausted ∧ consecutive_empty=1 인 18행은 planRevive 대상이 아니다(consecutive_empty=0 만 되살림). consecutive_empty=0 인
--      4행(tldv·krisp·read-ai·granola)은 동결선(80) 여유가 생기면 되살아날 수 있다 — 넷 다 us:en 타깃이 이미 있는 제품이다.
--
-- 라벨: kr = '<영역>:<slug>' · 구글 플레이 us = '<영역>:us-en|<slug>' · 앱스토어 us = '<영역>:us|<slug>'(target-supply areaOf ^([1-5]): 호환).
--   ⑤ 글쓰기 암은 이 세 꼴만 쓴다. 리뷰관리 암(wordpress·shopify)은 '5:wp|<slug>'·'5:shopify|<slug>' 로 갈라 쓴다(드라이런 §5).
--
-- 가드레일(남헌 v37 — 예외 없음): 구글 플레이 하루 30요청 · 활성 80 동결. 이 마이그는 review_sources·review_source_ramp 를
--   건드리지 않는다(요청 예산 불변). 사전 검사 DO 가 (a)구글 플레이 활성 = 88 (b)#464 1차 고정 8 ref 가 정확히 8행 active
--   (c)그 밖 us:en active 0 (d)googleplay·appstore enabled 를, 사후 DO 가 ①활성 순변화 0 ②고정 예외 8 을 뺀 활성 ≤ 80
--   ③앱스토어 활성 비중 ≤ 30%(SHARE_GATE) 를 확인하고 어긋나면 RAISE → 전체 롤백. #464 2차(활성 97)가 먼저면 (a) 에서 멈춘다.
--
-- 멱등: 프로젝트는 pitch NOT EXISTS, 타깃은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뜀(투입기 exists 와 같은 뜻)
--   + ON CONFLICT (project_id, source_key, product_ref) DO NOTHING, 맞바꾸기는 status='active' 인 행만 바꾼다.
--   재실행 = 0행 INSERT · 0행 UPDATE 이고 DO 블록이 최종 상태를 다시 확인한다.
-- 선행: 없음(review_targets 20260829000003 · analysis_projects 20260816000001). T0 라벨 정규화(20261008000010)와 순서 무관 —
--   이 파일은 기존 행의 label 을 읽지도 쓰지도 않는다.
-- 롤백: 20261008000020_english_targets_v37_rollback.sql (새 타깃 → failed, 맞바꾼 22행 → active).
--   ⚠️ PR #464 롤백(reports/2026-10-08/20261008000001_…_rollback.sql A)의 식별자 `product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%'`
--   는 이 마이그의 구글 플레이 us:en 20행도 잡는다. #464 만 멈추려면 그 파일을 쓰지 말고 id 를 좁혀라.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 오케스트레이터(Opus 사전검토 뒤).
--   §10.2 예외 2번 해당 여부: 22행 status 한 열 UPDATE(롤백 동반) — 대량 UPDATE 4조건(드라이런·롤백·무중단·Notion) 기록 필요.
--   절차: 1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 드라이런 문서의 적용 전 체크리스트 C1~C10 3) 실행 4) 하단 확인 쿼리 5) docs/migration-exceptions.md 기입.
--   야간 수집(nightly-review-collect) 실행 중에는 적용하지 않는다(맞바꾸기 후보가 그 사이 수집되면 DO ④ 가 RAISE 한다 — 그때는 드라이런 재생성).
-- ============================================================

-- ── 적용 전 확인: reports/2026-10-08/english-expansion-targets-dryrun.md 상단 "적용 전 체크리스트" 10개(C1~C10). 하나라도 기대와 다르면 적용하지 않는다.
--   이 파일의 사전 검사 DO 가 그중 C1·C2·C5(enabled) 를 트랜잭션 안에서 다시 확인한다.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 0. 입력 ───────────────────────────────────────────────────
CREATE TEMP TABLE _v37_proj (slug text PRIMARY KEY, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _v37_proj (slug, pitch, url) VALUES
  ('grammarly', 'Grammarly (그래머리) — 영문 문법·맞춤법·톤 교정과 생성형 AI 글쓰기 보조. 2025-10 회사명이 Superhuman 으로 바뀌었고 제품명 Grammarly 는 유지', 'https://www.grammarly.com/'),
  ('quillbot', 'QuillBot (퀼봇) — AI 패러프레이즈·문법 검사·요약 도구 (Learneo 소속)', 'https://quillbot.com/'),
  ('wordtune', 'Wordtune (워드튠) — AI21 Labs 의 문장 재작성·톤 변환 글쓰기 보조', 'https://www.wordtune.com/'),
  ('notion-ai', 'Notion AI (노션 AI) — 노션 문서·위키 안에서 초안 작성·요약·검색을 하는 AI 기능', 'https://www.notion.com/product/ai'),
  ('craft-docs', 'Craft (크래프트) — AI 어시스턴트를 내장한 문서·노트 편집기 (Craft Docs Limited)', 'https://www.craft.do/'),
  ('sudowrite', 'Sudowrite (수도라이트) — 소설·창작 글쓰기 특화 AI (Human Plus Plus, Inc.)', 'https://www.sudowrite.com/'),
  ('gamma', 'Gamma (감마) — 프롬프트로 프레젠테이션·문서·웹페이지를 생성하는 AI 도구 (Gamma Tech, Inc.)', 'https://gamma.app'),
  ('ginger', 'Ginger (진저) — Ginger Software 의 문법 교정·재작성 도구와 키보드', 'https://www.gingersoftware.com/'),
  ('wrtn', 'Wrtn (뤼튼) — 뤼튼테크놀로지스의 AI 글쓰기·검색·과제 도구 통합 서비스', 'https://wrtn.ai/'),
  ('polaris-office-ai', 'Polaris Office AI (폴라리스 오피스 AI) — 폴라리스오피스의 AI 문서 초안·PPT 생성·문서 질의(AI NOVA) 기능', 'https://www.polarisoffice.com/ko');

-- anchor_* = 같은 제품의 기존 kr 타깃(그 프로젝트에 붙인다). NULL 이면 _v37_proj 의 pitch 프로젝트.
CREATE TEMP TABLE _v37_new (
  area text NOT NULL, slug text NOT NULL, source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL,
  anchor_source text, anchor_ref text, project_id uuid,
  PRIMARY KEY (source_key, product_ref)
) ON COMMIT DROP;
INSERT INTO _v37_new (area, slug, source_key, product_ref, label, anchor_source, anchor_ref) VALUES
  -- ② 영업 · 구글 플레이 us:en 7
  ('2', 'clari', 'googleplay', 'us:en:com.clari', '2:us-en|clari', 'googleplay', 'kr:ko:com.clari'),
  ('2', 'outreach', 'googleplay', 'us:en:io.outreach.sales', '2:us-en|outreach', 'googleplay', 'kr:ko:io.outreach.sales'),
  ('2', 'salesloft', 'googleplay', 'us:en:com.salesloftmobile', '2:us-en|salesloft', 'googleplay', 'kr:ko:com.salesloftmobile'),
  ('2', 'zoominfo', 'googleplay', 'us:en:com.zoominfo.enterprise', '2:us-en|zoominfo', 'googleplay', 'kr:ko:com.zoominfo.enterprise'),
  ('2', 'highspot', 'googleplay', 'us:en:com.highspot.Highspot', '2:us-en|highspot', 'googleplay', 'kr:ko:com.highspot.Highspot'),
  ('2', 'instantly', 'googleplay', 'us:en:ai.instantly.app', '2:us-en|instantly', 'googleplay', 'kr:ko:ai.instantly.app'),
  ('2', 'hubspot-sales-hub', 'googleplay', 'us:en:com.hubspot.android', '2:us-en|hubspot-sales-hub', 'googleplay', 'kr:ko:com.hubspot.android'),
  -- ② 영업 · 앱스토어 us 7
  ('2', 'gong', 'appstore', 'us:1289289459', '2:us|gong', 'appstore', 'kr:1289289459'),
  ('2', 'clari', 'appstore', 'us:977304452', '2:us|clari', 'appstore', 'kr:977304452'),
  ('2', 'salesloft', 'appstore', 'us:1455032473', '2:us|salesloft', 'appstore', 'kr:1455032473'),
  ('2', 'zoominfo', 'appstore', 'us:1493170277', '2:us|zoominfo', 'appstore', 'kr:1493170277'),
  ('2', 'highspot', 'appstore', 'us:1173751523', '2:us|highspot', 'appstore', 'kr:1173751523'),
  ('2', 'instantly', 'appstore', 'us:6474658497', '2:us|instantly', 'appstore', 'kr:6474658497'),
  ('2', 'hubspot-sales-hub', 'appstore', 'us:1107711722', '2:us|hubspot-sales-hub', 'appstore', 'kr:1107711722'),
  -- ③ 마케팅(수집 0건 5개) · 구글 플레이 us:en 4 (motion-creative 는 구글 플레이 앱 없음)
  ('3', 'adcreative-ai', 'googleplay', 'us:en:ai.adcreative.m', '3:us-en|adcreative-ai', 'googleplay', 'kr:ko:ai.adcreative.m'),
  ('3', 'foreplay', 'googleplay', 'us:en:co.foreplay.ForeplayMobile', '3:us-en|foreplay', 'googleplay', 'kr:ko:co.foreplay.ForeplayMobile'),
  ('3', 'simplified', 'googleplay', 'us:en:co.simplified.main', '3:us-en|simplified', 'googleplay', 'kr:ko:co.simplified.main'),
  ('3', 'predis-ai', 'googleplay', 'us:en:com.predis.app', '3:us-en|predis-ai', 'googleplay', 'kr:ko:com.predis.app'),
  -- ③ 마케팅 · 앱스토어 us 5
  ('3', 'adcreative-ai', 'appstore', 'us:6740659906', '3:us|adcreative-ai', 'appstore', 'kr:6740659906'),
  ('3', 'foreplay', 'appstore', 'us:6466097243', '3:us|foreplay', 'appstore', 'kr:6466097243'),
  ('3', 'motion-creative', 'appstore', 'us:6738098343', '3:us|motion-creative', 'appstore', 'kr:6738098343'),
  ('3', 'simplified', 'appstore', 'us:1610971740', '3:us|simplified', 'appstore', 'kr:1610971740'),
  ('3', 'predis-ai', 'appstore', 'us:6450264767', '3:us|predis-ai', 'appstore', 'kr:6450264767'),
  -- ④ 인사(평가 도구) · 구글 플레이 us:en 2 + 앱스토어 us 2
  ('4', '15five', 'googleplay', 'us:en:com.fifteenfive.fifteenfiveapp', '4:us-en|15five', 'googleplay', 'kr:ko:com.fifteenfive.fifteenfiveapp'),
  ('4', 'lattice', 'googleplay', 'us:en:com.lattice', '4:us-en|lattice', 'googleplay', 'kr:ko:com.lattice'),
  ('4', '15five', 'appstore', 'us:1020253220', '4:us|15five', 'appstore', 'kr:1020253220'),
  ('4', 'lattice', 'appstore', 'us:1409785530', '4:us|lattice', 'appstore', 'kr:1409785530'),
  -- ⑤ 글쓰기 시험 암 · 구글 플레이 us:en 7 + kr:ko 2
  ('5', 'grammarly', 'googleplay', 'us:en:com.grammarly.android.keyboard', '5:us-en|grammarly', NULL, NULL),
  ('5', 'quillbot', 'googleplay', 'us:en:com.quillbot.mobile', '5:us-en|quillbot', NULL, NULL),
  ('5', 'notion-ai', 'googleplay', 'us:en:notion.id', '5:us-en|notion-ai', NULL, NULL),
  ('5', 'craft-docs', 'googleplay', 'us:en:com.craft.docs', '5:us-en|craft-docs', NULL, NULL),
  ('5', 'sudowrite', 'googleplay', 'us:en:com.humanplusplus.sudowrite', '5:us-en|sudowrite', NULL, NULL),
  ('5', 'gamma', 'googleplay', 'us:en:app.gamma.mobile', '5:us-en|gamma', NULL, NULL),
  ('5', 'ginger', 'googleplay', 'us:en:com.gingersoftware.android.keyboard', '5:us-en|ginger', NULL, NULL),
  ('5', 'wrtn', 'googleplay', 'kr:ko:com.wrtn.app', '5:wrtn', NULL, NULL),
  ('5', 'polaris-office-ai', 'googleplay', 'kr:ko:com.infraware.office.link', '5:polaris-office-ai', NULL, NULL),
  -- ⑤ 글쓰기 시험 암 · 앱스토어 us 8 + kr 8
  ('5', 'grammarly', 'appstore', 'us:1158877342', '5:us|grammarly', NULL, NULL),
  ('5', 'quillbot', 'appstore', 'us:6463116243', '5:us|quillbot', NULL, NULL),
  ('5', 'wordtune', 'appstore', 'us:1628773284', '5:us|wordtune', NULL, NULL),
  ('5', 'notion-ai', 'appstore', 'us:1232780281', '5:us|notion-ai', NULL, NULL),
  ('5', 'craft-docs', 'appstore', 'us:1487937127', '5:us|craft-docs', NULL, NULL),
  ('5', 'sudowrite', 'appstore', 'us:6740884542', '5:us|sudowrite', NULL, NULL),
  ('5', 'gamma', 'appstore', 'us:6768404578', '5:us|gamma', NULL, NULL),
  ('5', 'ginger', 'appstore', 'us:822797943', '5:us|ginger', NULL, NULL),
  ('5', 'grammarly', 'appstore', 'kr:1158877342', '5:grammarly', NULL, NULL),
  ('5', 'quillbot', 'appstore', 'kr:6463116243', '5:quillbot', NULL, NULL),
  ('5', 'notion-ai', 'appstore', 'kr:1232780281', '5:notion-ai', NULL, NULL),
  ('5', 'craft-docs', 'appstore', 'kr:1487937127', '5:craft-docs', NULL, NULL),
  ('5', 'gamma', 'appstore', 'kr:6768404578', '5:gamma', NULL, NULL),
  ('5', 'ginger', 'appstore', 'kr:822797943', '5:ginger', NULL, NULL),
  ('5', 'wrtn', 'appstore', 'kr:6448556170', '5:wrtn', NULL, NULL),
  ('5', 'polaris-office-ai', 'appstore', 'kr:698070860', '5:polaris-office-ai', NULL, NULL);

-- 맞바꾸기로 내리는 googleplay kr:ko 22행(드라이런 §3 표와 같은 순서).
CREATE TEMP TABLE _v37_swap (id uuid PRIMARY KEY, product_ref text NOT NULL) ON COMMIT DROP;
INSERT INTO _v37_swap (id, product_ref) VALUES
  ('325be79c-21c3-46eb-abbf-333052878d66', 'kr:ko:com.helium10.app'),
  ('7460dec5-43a3-4858-8378-0ed61bb41b90', 'kr:ko:com.triplewhale.android.v2'),
  ('a1381ea4-ed54-4a0c-b077-501abeb51e33', 'kr:ko:io.gong.mobileapp'),
  ('3b8f357e-fbb9-4248-8d36-0af3ff3c7e1b', 'kr:ko:com.clari'),
  ('c6f210b5-ce6e-4b73-b401-6003d79a01bf', 'kr:ko:com.salesloftmobile'),
  ('1af25224-787b-453d-add7-487497c05984', 'kr:ko:com.zoominfo.enterprise'),
  ('b9099479-489a-42f1-8912-2e3a32e1030e', 'kr:ko:com.highspot.Highspot'),
  ('127cdff1-492a-4914-9b57-00462105abe2', 'kr:ko:ai.instantly.app'),
  ('f8b6d2f3-fff2-469b-800a-c24a030de10a', 'kr:ko:ai.adcreative.m'),
  ('37907d10-b433-476e-a6a5-0903ddaa7274', 'kr:ko:com.predis.app'),
  ('34a2fddc-00d8-45f2-aee8-e3a2ff623070', 'kr:ko:co.simplified.main'),
  ('e6df374f-7153-4993-8110-ee3fff2324fd', 'kr:ko:co.foreplay.ForeplayMobile'),
  ('34031838-b921-4705-ac52-25165821c6d1', 'kr:ko:com.people.rippling'),
  ('9e2ca9a0-1a48-48a7-bffd-72c91689bcc4', 'kr:ko:com.gusto.money'),
  ('8953630a-7199-4bea-8fd1-5043f274cce6', 'kr:ko:com.hibob'),
  ('b392c930-895f-439d-bdfa-639c28030eb6', 'kr:ko:com.personio'),
  ('fa534580-7ae3-4e5f-ab69-0556d3c27914', 'kr:ko:com.lattice'),
  ('7216d264-0b80-4af3-9ece-1d59454566de', 'kr:ko:com.fifteenfive.fifteenfiveapp'),
  ('48ef8d40-2441-4f52-a94a-895da9ecdbb1', 'kr:ko:com.tldv.tldvlite'),
  ('c66f3f63-2bc7-43b3-9271-cd51630c974b', 'kr:ko:ai.krisp.krispMobile'),
  ('d69b4673-7b7c-4927-8689-59d8b5b0775c', 'kr:ko:com.read.ai'),
  ('404123b9-3ba0-487f-8e48-15f7b175d215', 'kr:ko:ai.granola');

-- 불변 확인용 스냅샷: 두 스토어의 기존 행 중 맞바꾸기 22행을 뺀 전부(DO ⑧ 이 EXCEPT 로 비교).
CREATE TEMP TABLE _v37_before ON COMMIT DROP AS
SELECT t.id, t.project_id, t.source_key, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
  FROM public.review_targets t
 WHERE t.source_key IN ('googleplay', 'appstore') AND t.id NOT IN (SELECT id FROM _v37_swap);

CREATE TEMP TABLE _v37_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

-- PR #464 1차 8행(동결선 일회성 예외) — 고정 목록. 'v37 이 넣지 않은 us:en 전부'로 세지 않는다(2차 9행이 섞이면 예외가 몰래 넓어진다).
CREATE TEMP TABLE _v37_pr464 (product_ref text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _v37_pr464 (product_ref) VALUES
  ('us:en:com.tldv.tldvlite'), ('us:en:com.read.ai'), ('us:en:ai.granola'), ('us:en:com.aimeetingos.meetingos'),
  ('us:en:mobile.linnworks.net'), ('us:en:com.shipstation.app'), ('us:en:com.helium10.app'), ('us:en:io.gong.mobileapp');

-- 사전 검사(쓰기 전): 기준 상태가 드라이런과 같을 때만 진행한다.
DO $$
DECLARE gp_before int; pr464_active int; us_en_other int; off_sources text;
BEGIN
  -- (a) 구글 플레이 활성 = 88(드라이런 기준). #464 2차 9행이 먼저 들어갔으면 97 → 여기서 멈춘다(동결선 판정 기준이 달라진다).
  SELECT n INTO gp_before FROM _v37_gp_before;
  IF gp_before <> 88 THEN RAISE EXCEPTION '구글 플레이 활성 %(기대 88) — 드라이런 이후 상태가 바뀌었다(#464 2차 등). 드라이런 재생성', gp_before; END IF;
  -- (b) 예외분 = #464 1차 8 ref 가 정확히 8행 active
  SELECT count(*) INTO pr464_active FROM public.review_targets t JOIN _v37_pr464 p ON p.product_ref = t.product_ref
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF pr464_active <> 8 THEN RAISE EXCEPTION '#464 1차 us:en active %행(기대 8)', pr464_active; END IF;
  -- (c) 그 밖의 us:en active 는 0(아직 v37 미적용 상태에서). 재실행이면 v37 의 20행만 허용.
  SELECT count(*) INTO us_en_other FROM public.review_targets t
   WHERE t.source_key = 'googleplay' AND t.status = 'active' AND t.product_ref LIKE 'us:en:%'
     AND t.product_ref NOT IN (SELECT product_ref FROM _v37_pr464)
     AND t.product_ref NOT IN (SELECT product_ref FROM _v37_new WHERE source_key = 'googleplay');
  IF us_en_other <> 0 THEN RAISE EXCEPTION '#464 1차·v37 밖의 us:en active %행 — 예외 범위가 다르다', us_en_other; END IF;
  -- (d) INSERT 대상 소스가 켜져 있다(꺼진 소스에 행이 조용히 쌓이지 않게). 행이 없어도 멈춘다.
  SELECT string_agg(k, ',') INTO off_sources FROM (VALUES ('googleplay'), ('appstore')) v(k)
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;
END $$;

-- ── 1. 프로젝트(⑤ 글쓰기, pitch 정확 일치로 재사용) ─────────────
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status, mode, business_model)
SELECT p.url, p.pitch, 'product_fit', 'collecting', 'forward', 'SAAS'
  FROM _v37_proj p
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects a WHERE a.product_elevator_pitch = p.pitch);

-- ── 2. 프로젝트 결정(앵커 → 그 타깃의 프로젝트 · 없으면 pitch 프로젝트) ──
UPDATE _v37_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = n.anchor_source AND k.product_ref = n.anchor_ref)
 WHERE n.anchor_source IS NOT NULL;
UPDATE _v37_new n SET project_id = (
  SELECT a.id FROM public.analysis_projects a JOIN _v37_proj p ON p.pitch = a.product_elevator_pitch
   WHERE p.slug = n.slug ORDER BY a.created_at, a.id LIMIT 1)
 WHERE n.anchor_source IS NULL;

DO $$
DECLARE bad int; dup int;
BEGIN
  -- 앵커가 정확히 1행(0행이면 project_id NULL, 2행 이상이면 위 서브쿼리가 이미 21000 으로 던진다)
  SELECT count(*) INTO bad FROM _v37_new WHERE project_id IS NULL;
  IF bad <> 0 THEN RAISE EXCEPTION '프로젝트를 못 정한 신규 타깃 %행(앵커 없음 또는 pitch 프로젝트 없음)', bad; END IF;
  -- 같은 (source, ref) 가 **다른** 프로젝트에 이미 있으면 같은 앱을 두 번 수집하게 된다 → 멈추고 사람이 본다
  SELECT count(*) INTO dup FROM _v37_new n JOIN public.review_targets t
      ON t.source_key = n.source_key AND t.product_ref = n.product_ref AND t.project_id <> n.project_id;
  IF dup <> 0 THEN RAISE EXCEPTION '신규 (source, product_ref) %개가 다른 프로젝트에 이미 있다', dup; END IF;
END $$;

-- ── 3. 신규 타깃 INSERT ───────────────────────────────────────
CREATE TEMP TABLE _v37_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, n.source_key, n.product_ref, n.label, 'active', NULL, NULL
    FROM _v37_new n
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _v37_ins SELECT id, source_key FROM ins;

-- ── 4. 맞바꾸기(status 한 열, 조건이 그대로일 때만) ─────────────
CREATE TEMP TABLE _v37_swapped (id uuid) ON COMMIT DROP;
WITH up AS (
  UPDATE public.review_targets t SET status = 'exhausted'
    FROM _v37_swap s
   WHERE t.id = s.id AND t.source_key = 'googleplay' AND t.product_ref = s.product_ref
     AND t.status = 'active' AND t.total_collected = 0 AND t.last_run_at IS NOT NULL
  RETURNING t.id
)
INSERT INTO _v37_swapped SELECT id FROM up;

-- ── 5. 검사 — 하나라도 어긋나면 RAISE → 전체 롤백 ──────────────
DO $$
DECLARE
  n_proj int; n_new int; n_new_gp int; n_swap int;
  gp_before int; gp_after int; gp_exc int;
  ins_gp int; ins_all int; swapped int;
  total_new int; bad_new int; bad_ref int; bad_label int; not_down int; changed int;
  as_active int; all_active int;
BEGIN
  SELECT count(*) INTO n_proj FROM _v37_proj;
  SELECT count(*), count(*) FILTER (WHERE source_key = 'googleplay') INTO n_new, n_new_gp FROM _v37_new;
  SELECT count(*) INTO n_swap FROM _v37_swap;
  IF (n_proj, n_new, n_new_gp, n_swap) <> (10, 52, 22, 22) THEN
    RAISE EXCEPTION '입력 개수 proj % · new % · new_gp % · swap %(기대 10·52·22·22)', n_proj, n_new, n_new_gp, n_swap;
  END IF;

  -- ① 신규 52행이 전부 있고 정해진 프로젝트에 있다(재실행이면 이전 실행분)
  SELECT count(*) INTO total_new FROM _v37_new n JOIN public.review_targets t
      ON t.source_key = n.source_key AND t.product_ref = n.product_ref AND t.project_id = n.project_id;
  IF total_new <> n_new THEN RAISE EXCEPTION '신규 타깃 %행만 있다(기대 %)', total_new, n_new; END IF;

  -- ② 이번 실행에 들어간 행: active · 미방문 · 카운터 0 · cursor NULL
  SELECT count(*) INTO bad_new FROM public.review_targets t JOIN _v37_ins i ON i.id = t.id
   WHERE t.status <> 'active' OR t.last_run_at IS NOT NULL OR t.consecutive_empty <> 0 OR t.total_collected <> 0
      OR t.cursor IS NOT NULL OR t.last_review_at IS NOT NULL;
  IF bad_new <> 0 THEN RAISE EXCEPTION '새 행 %개가 기대 상태(active·미방문·카운터 0)가 아니다', bad_new; END IF;

  -- ③ product_ref 형식(어댑터 parseProductRef: googleplay <gl>:<hl>:<패키지> · appstore <국가>:<숫자 id>)
  SELECT count(*) INTO bad_ref FROM _v37_new n
   WHERE NOT ((n.source_key = 'googleplay' AND n.product_ref ~ '^(us:en|kr:ko):[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$')
           OR (n.source_key = 'appstore'   AND n.product_ref ~ '^(us|kr):[0-9]+$'));
  IF bad_ref <> 0 THEN RAISE EXCEPTION 'product_ref %개가 어댑터 형식이 아니다', bad_ref; END IF;

  -- ④ 라벨 규칙: kr '<N>:<slug>' · googleplay us '<N>:us-en|<slug>' · appstore us '<N>:us|<slug>' · N = area · slug 일치
  SELECT count(*) INTO bad_label FROM _v37_new n
   WHERE n.label <> n.area || ':' ||
         CASE WHEN n.product_ref LIKE 'kr:%' THEN ''
              WHEN n.source_key = 'googleplay' THEN 'us-en|'
              ELSE 'us|' END || n.slug
      OR n.label !~ '^[1-5]:';
  IF bad_label <> 0 THEN RAISE EXCEPTION 'label %개가 규칙에 안 맞는다', bad_label; END IF;

  -- ⑤ 맞바꾼 22행이 전부 내려가 있다(이번 실행 또는 이전 실행). 그새 수집돼 active 로 남은 행이 있으면 여기서 멈춘다.
  SELECT count(*) INTO not_down FROM public.review_targets t JOIN _v37_swap s ON s.id = t.id
   WHERE t.status <> 'exhausted' OR t.source_key <> 'googleplay' OR t.product_ref <> s.product_ref;
  IF not_down <> 0 THEN RAISE EXCEPTION '맞바꾸기 대상 %행이 exhausted 가 아니다(드라이런 이후 상태가 바뀜 — 드라이런 재생성)', not_down; END IF;

  -- ⑥ 구글 플레이 1:1 — 이번 실행 INSERT 수 = 이번 실행 UPDATE 수, 활성 순변화 0
  SELECT count(*) FILTER (WHERE source_key = 'googleplay'), count(*) INTO ins_gp, ins_all FROM _v37_ins;
  SELECT count(*) INTO swapped FROM _v37_swapped;
  IF ins_gp <> swapped THEN RAISE EXCEPTION '구글 플레이 신규 % ≠ 내린 % (1:1 아님)', ins_gp, swapped; END IF;
  SELECT n INTO gp_before FROM _v37_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after <> gp_before THEN RAISE EXCEPTION '구글 플레이 활성 % → %(순변화 0 이어야 함)', gp_before, gp_after; END IF;

  -- ⑦ 동결선 80: 적용 전 88 이었고(사전 검사 a), 예외분 = #464 1차 고정 8 ref 가 정확히 8행 active, 그걸 뺀 활성 ≤ 80
  IF gp_before <> 88 THEN RAISE EXCEPTION '구글 플레이 적용 전 활성 %(기대 88)', gp_before; END IF;
  SELECT count(*) INTO gp_exc FROM public.review_targets t JOIN _v37_pr464 p ON p.product_ref = t.product_ref
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF gp_exc <> 8 THEN RAISE EXCEPTION '#464 1차 예외 active %행(기대 8)', gp_exc; END IF;
  IF gp_after - gp_exc > 80 THEN RAISE EXCEPTION '구글 플레이 예외분 제외 활성 %(> 80)', gp_after - gp_exc; END IF;

  -- ⑧ 맞바꾸기 22행 밖의 기존 두 스토어 행 불변
  SELECT count(*) INTO changed FROM (
    SELECT * FROM _v37_before
    EXCEPT
    SELECT t.id, t.project_id, t.source_key, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
      FROM public.review_targets t WHERE t.source_key IN ('googleplay', 'appstore')
  ) d;
  IF changed <> 0 THEN RAISE EXCEPTION '기존 행 %개가 바뀌었다', changed; END IF;

  -- ⑨ 30% 게이트(SHARE_GATE): 앱스토어 활성 ÷ enabled 소스 활성 ≤ 0.3
  SELECT count(*) FILTER (WHERE t.source_key = 'appstore'), count(*) INTO as_active, all_active
    FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.status = 'active';
  IF as_active > 0.3 * all_active THEN RAISE EXCEPTION '앱스토어 활성 % / 전체 % > 30%%', as_active, all_active; END IF;

  RAISE NOTICE 'v37: 이번 INSERT 타깃 %(googleplay %) · 내림 % · googleplay 활성 %→% (예외 제외 %) · appstore 활성 %/% · 프로젝트 후보 %',
    ins_all, ins_gp, swapped, gp_before, gp_after, gp_after - gp_exc, as_active, all_active, n_proj;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- WITH v37(source_key, product_ref) AS (VALUES
--   ('googleplay','us:en:com.clari'),('googleplay','us:en:io.outreach.sales'),('googleplay','us:en:com.salesloftmobile'),('googleplay','us:en:com.zoominfo.enterprise'),
--   ('googleplay','us:en:com.highspot.Highspot'),('googleplay','us:en:ai.instantly.app'),('googleplay','us:en:com.hubspot.android'),('appstore','us:1289289459'),
--   ('appstore','us:977304452'),('appstore','us:1455032473'),('appstore','us:1493170277'),('appstore','us:1173751523'),
--   ('appstore','us:6474658497'),('appstore','us:1107711722'),('googleplay','us:en:ai.adcreative.m'),('googleplay','us:en:co.foreplay.ForeplayMobile'),
--   ('googleplay','us:en:co.simplified.main'),('googleplay','us:en:com.predis.app'),('appstore','us:6740659906'),('appstore','us:6466097243'),
--   ('appstore','us:6738098343'),('appstore','us:1610971740'),('appstore','us:6450264767'),('googleplay','us:en:com.fifteenfive.fifteenfiveapp'),
--   ('googleplay','us:en:com.lattice'),('appstore','us:1020253220'),('appstore','us:1409785530'),('googleplay','us:en:com.grammarly.android.keyboard'),
--   ('googleplay','us:en:com.quillbot.mobile'),('googleplay','us:en:notion.id'),('googleplay','us:en:com.craft.docs'),('googleplay','us:en:com.humanplusplus.sudowrite'),
--   ('googleplay','us:en:app.gamma.mobile'),('googleplay','us:en:com.gingersoftware.android.keyboard'),('googleplay','kr:ko:com.wrtn.app'),('googleplay','kr:ko:com.infraware.office.link'),
--   ('appstore','us:1158877342'),('appstore','us:6463116243'),('appstore','us:1628773284'),('appstore','us:1232780281'),
--   ('appstore','us:1487937127'),('appstore','us:6740884542'),('appstore','us:6768404578'),('appstore','us:822797943'),
--   ('appstore','kr:1158877342'),('appstore','kr:6463116243'),('appstore','kr:1232780281'),('appstore','kr:1487937127'),
--   ('appstore','kr:6768404578'),('appstore','kr:822797943'),('appstore','kr:6448556170'),('appstore','kr:698070860'))
-- SELECT t.source_key, count(*), count(*) FILTER (WHERE t.status='active' AND t.last_run_at IS NULL) AS fresh
--   FROM public.review_targets t JOIN v37 USING (source_key, product_ref) GROUP BY 1;   -- 기대: appstore 30 · googleplay 22 (적용 직후 fresh 도 같음)
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';                 -- 기대: 88(적용 전과 같음)
-- SELECT status, count(*) FROM public.review_targets WHERE id IN (
--   '325be79c-21c3-46eb-abbf-333052878d66','7460dec5-43a3-4858-8378-0ed61bb41b90','a1381ea4-ed54-4a0c-b077-501abeb51e33',
--   '3b8f357e-fbb9-4248-8d36-0af3ff3c7e1b','c6f210b5-ce6e-4b73-b401-6003d79a01bf','1af25224-787b-453d-add7-487497c05984',
--   'b9099479-489a-42f1-8912-2e3a32e1030e','127cdff1-492a-4914-9b57-00462105abe2','f8b6d2f3-fff2-469b-800a-c24a030de10a',
--   '37907d10-b433-476e-a6a5-0903ddaa7274','34a2fddc-00d8-45f2-aee8-e3a2ff623070','e6df374f-7153-4993-8110-ee3fff2324fd',
--   '34031838-b921-4705-ac52-25165821c6d1','9e2ca9a0-1a48-48a7-bffd-72c91689bcc4','8953630a-7199-4bea-8fd1-5043f274cce6',
--   'b392c930-895f-439d-bdfa-639c28030eb6','fa534580-7ae3-4e5f-ab69-0556d3c27914','7216d264-0b80-4af3-9ece-1d59454566de',
--   '48ef8d40-2441-4f52-a94a-895da9ecdbb1','c66f3f63-2bc7-43b3-9271-cd51630c974b','d69b4673-7b7c-4927-8689-59d8b5b0775c',
--   '404123b9-3ba0-487f-8e48-15f7b175d215') GROUP BY 1;                         -- 기대: exhausted 22
-- SELECT count(*) FROM public.analysis_projects WHERE status='collecting' AND product_elevator_pitch ~ '^(Grammarly|QuillBot|Wordtune|Notion AI|Craft|Sudowrite|Gamma|Ginger|Wrtn|Polaris Office AI) \(';
--                                                                             -- 기대: 10(이미 있던 같은 pitch 포함)
-- SELECT cap_base, daily_request_target, pct_step FROM public.review_source_ramp WHERE source_key IN ('googleplay','appstore');  -- 기대: 적용 전과 같음
-- 음성(롤백되는 형태 — 데이터 남기지 않음):
-- BEGIN; INSERT INTO public.review_targets (project_id, source_key, product_ref, status)
--        SELECT project_id, source_key, product_ref, 'active' FROM public.review_targets WHERE label = '2:us-en|clari'; ROLLBACK;
--                                                                             -- 기대: 23505 review_targets_project_source_product_key
-- BEGIN; UPDATE public.review_targets SET status='paused' WHERE label = '5:us|grammarly'; ROLLBACK;   -- 기대: 23514 review_targets_status_check
-- 재실행 멱등: 파일 전체를 한 번 더 실행 → NOTICE '이번 INSERT 타깃 0(googleplay 0) · 내림 0' 이고 DO 검사 통과면 정상(쓰기 0행).
