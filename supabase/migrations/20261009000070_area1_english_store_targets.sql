-- ============================================================
-- 20261009000070_area1_english_store_targets
--
-- ⛔ 미적용 — CTO 서브에이전트 초안(CEO-staff 위임 v45 §1·§4-4). 적용은 오케스트레이터(CEO-staff) 판단.
--    §10.2: INSERT 7 + status 한 열 UPDATE 최대 2(롤백 동반). 대량 UPDATE 아님(≤10행 가드).
--
-- 무엇을 — 영역 ① 영어 제품 5개(tldv·avoma·fathom·granola·jamie)의 영어 스토어 타깃:
--   (a) 앱스토어 us 5행 INSERT — 같은 숫자 ID 의 기존 appstore kr 타깃을 앵커로(그 프로젝트에 붙인다, v37 000020 방식).
--   (b) 구글 플레이 us:en 2행 INSERT — avoma(com.avoma.android)·jamie(ai.meetjamie.expoapp). 앵커 = 같은 패키지 kr:ko 타깃.
--       tldv·granola 는 us:en 이 이미 있다(#464 1차 예외 행) → 건너뛴다. fathom 은 사전에 구글 플레이 앱 '미발견'
--       (reports/2026-10-05/product-dictionary/area-01-meeting-notes.json fathom.sources.googleplay) → 건너뛰고 NOTICE.
--   (c) 구글 플레이 동결선(예외 제외 활성 80, 슬롯 A 적용 뒤 85/80 — 여유 0)을 넘지 않게 1:1 맞바꾸기:
--       avoma·jamie 자기 kr:ko 앵커가 active 면 'failed' 로 일시 정지(+ 기록 review_targets_paused_20261009, 슬롯 A 와 같은 표).
--       같은 앱의 한국 스토어 판 → 영어 판 교체. exhausted 가 아니라 failed 인 이유 = planRevive 가 exhausted∧consecutive_empty=0 을
--       되살린다(lib/review/target-supply.ts planRevive) — 슬롯 A 000030 머리말과 같은 근거.
--       앵커가 이미 active 가 아니면 맞바꾸지 않고, 사후 검사가 동결선 초과면 RAISE 한다(한도 예외 금지).
--   슬롯 A 드라이런(reports/2026-10-09/slot-a-dryrun.md §2)의 '보류 후보 — 같은 꼴의 1:1 맞바꾸기로만 복귀' 경로를 그대로 쓴다.
--
-- 라벨: 앱스토어 us '1:us|<slug>' · 구글 플레이 us '1:us-en|<slug>'(v37 규칙, target-supply areaOf ^([1-5]): 호환). jamie 의 slug 는 DB 라벨대로 'jamie'.
-- 손대지 않는 것: review_sources·review_source_ramp(요청 예산·cap_base 불변 — 새 cap_base 불필요, 두 소스 다 기존 램프 행), label, DELETE·DDL 0.
--
-- 가드(하나라도 어긋나면 RAISE → 전체 롤백):
--   사전: 두 소스 enabled · 두 소스 running 실행 없음 · 슬롯 A 기록 테이블 있음 · 앵커 7개 각 정확히 1행 · 상태 A(처음)/B(적용됨) 판정 ·
--         A 에서 구글 플레이 예외 제외 활성 ≤ 80.
--   사후: 이번 쓰기 행 수(INSERT+UPDATE) ≤ 10 · 신규 7행 정해진 프로젝트·라벨 · 새 행 active·미방문·카운터 0 ·
--         구글 플레이 활성 ≤ 적용 전 ∧ 예외 제외 ≤ 80 · 앱스토어 활성 ÷ enabled 소스 활성 ≤ 30%(SHARE_GATE) · 맞바꾸기 2행 밖 기존 행 불변.
-- 멱등: 재실행 = 쓰기 0행(상태 B), DO 가 최종 상태를 다시 확인한다. 롤백 뒤 재실행도 B(0행) — failed 7행을 되살리지 않는다(되살림은 별도 판단).
-- 셀프테스트: PGlite 0.2 축소 픽스처(googleplay 85/예외 5 · 앵커 7)에서 적용·재적용·롤백·롤백 재실행·음성 6종 19/19 통과(리포 밖 일회성).
-- 선행: 20261009000030(슬롯 A — 기록 테이블·동결선 85/80 기준). 롤백: 20261009000070_area1_english_store_targets_rollback.sql
--
-- 적용 전 드라이런(읽기만, CEO-staff 가 돌린다):
--   SELECT v.s, v.r, t.id, t.status, t.total_collected, t.last_run_at, t.label FROM (VALUES
--     ('appstore','kr:6753818538'),('appstore','kr:1541170153'),('appstore','kr:6751613402'),('appstore','kr:6739429409'),('appstore','kr:6747801435'),
--     ('googleplay','kr:ko:com.avoma.android'),('googleplay','kr:ko:ai.meetjamie.expoapp')) v(s, r)
--   LEFT JOIN public.review_targets t ON t.source_key = v.s AND t.product_ref = v.r;                -- 기대 7행 모두 id 있음(앵커). googleplay 2행의 status·수집 수 = 정지 대상
--   SELECT source_key, product_ref FROM public.review_targets WHERE (source_key='appstore' AND product_ref IN
--     ('us:6753818538','us:1541170153','us:6751613402','us:6739429409','us:6747801435'))
--     OR (source_key='googleplay' AND product_ref IN ('us:en:com.avoma.android','us:en:ai.meetjamie.expoapp'));   -- 기대 0행
--   SELECT t.source_key, count(*) FROM public.review_targets t JOIN public.review_sources s ON s.key=t.source_key AND s.enabled
--    WHERE t.status='active' GROUP BY 1 ORDER BY 1;                                                   -- appstore+5 가 (전체+5)의 30% 이하인지
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _v45_new (
  slug text NOT NULL, source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL,
  anchor_ref text NOT NULL, project_id uuid,
  PRIMARY KEY (source_key, product_ref)
) ON COMMIT DROP;
INSERT INTO _v45_new (slug, source_key, product_ref, label, anchor_ref) VALUES
  ('tldv',    'appstore',   'us:6753818538',               '1:us|tldv',       'kr:6753818538'),
  ('avoma',   'appstore',   'us:1541170153',               '1:us|avoma',      'kr:1541170153'),
  ('fathom',  'appstore',   'us:6751613402',               '1:us|fathom',     'kr:6751613402'),
  ('granola', 'appstore',   'us:6739429409',               '1:us|granola',    'kr:6739429409'),
  ('jamie',   'appstore',   'us:6747801435',               '1:us|jamie',      'kr:6747801435'),
  ('avoma',   'googleplay', 'us:en:com.avoma.android',     '1:us-en|avoma',   'kr:ko:com.avoma.android'),
  ('jamie',   'googleplay', 'us:en:ai.meetjamie.expoapp',  '1:us-en|jamie',   'kr:ko:ai.meetjamie.expoapp');

-- PR #464 1차 고정 8 ref(동결선 일회성 예외 — 슬롯 A 뒤 5행 active). 000020·000030 과 같은 목록.
CREATE TEMP TABLE _v45_pr464 (product_ref text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _v45_pr464 (product_ref) VALUES
  ('us:en:com.tldv.tldvlite'), ('us:en:com.read.ai'), ('us:en:ai.granola'), ('us:en:com.aimeetingos.meetingos'),
  ('us:en:mobile.linnworks.net'), ('us:en:com.shipstation.app'), ('us:en:com.helium10.app'), ('us:en:io.gong.mobileapp');

-- 앵커 → project_id (2행 이상이면 서브쿼리가 21000 으로 던진다)
UPDATE _v45_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = n.source_key AND k.product_ref = n.anchor_ref);

-- 맞바꾸기 후보 = 구글 플레이 신규의 kr:ko 앵커
CREATE TEMP TABLE _v45_swap ON COMMIT DROP AS
SELECT k.id, k.status AS status_before, k.label, k.total_collected
  FROM public.review_targets k JOIN _v45_new n ON n.source_key = 'googleplay' AND k.source_key = 'googleplay' AND k.product_ref = n.anchor_ref;

CREATE TEMP TABLE _v45_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

CREATE TEMP TABLE _v45_before ON COMMIT DROP AS
SELECT t.id, t.project_id, t.source_key, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
  FROM public.review_targets t
 WHERE t.source_key IN ('googleplay', 'appstore') AND t.id NOT IN (SELECT id FROM _v45_swap);

-- ── 사전 검사 ─────────────────────────────────────────────────
CREATE TEMP TABLE _v45_state (state text) ON COMMIT DROP;
DO $$
DECLARE off_sources text; running_at text; no_proj int; has_log int; n_exist int; n_ours int; gp_before int; pr464 int; st text;
BEGIN
  SELECT string_agg(k, ',') INTO off_sources FROM (VALUES ('googleplay'), ('appstore')) v(k)
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;

  -- 러너는 집은 타깃의 status 를 id 만 보고 덮어쓴다(lib/review/store.ts saveTargetProgress) → 실행 중이면 정지가 덮인다
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN ('googleplay', 'appstore') AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 적용하라', running_at; END IF;

  SELECT count(*) INTO has_log FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_targets_paused_20261009';
  IF has_log <> 1 THEN RAISE EXCEPTION '선행 20261009000030(슬롯 A) 미적용 — review_targets_paused_20261009 없음'; END IF;

  SELECT count(*) INTO no_proj FROM _v45_new WHERE project_id IS NULL;
  IF no_proj <> 0 THEN RAISE EXCEPTION '앵커(kr 타깃)가 없어 프로젝트를 못 정한 신규 %행', no_proj; END IF;

  SELECT count(*) INTO n_exist FROM _v45_new n
   WHERE EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref);
  SELECT count(*) INTO n_ours FROM _v45_new n JOIN public.review_targets t
      ON t.source_key = n.source_key AND t.product_ref = n.product_ref AND t.project_id = n.project_id AND t.label = n.label;
  IF n_exist = 0 THEN st := 'A';
  ELSIF n_exist = 7 AND n_ours = 7 THEN st := 'B';
  ELSE RAISE EXCEPTION '처음(A)도 적용됨(B)도 아니다 — 신규 쌍 존재 %/7 · 이 마이그 프로젝트·라벨 %/7. 누가 먼저 넣었다 — 사람 확인', n_exist, n_ours;
  END IF;

  IF st = 'A' THEN
    SELECT n INTO gp_before FROM _v45_gp_before;
    SELECT count(*) INTO pr464 FROM public.review_targets t JOIN _v45_pr464 p USING (product_ref)
     WHERE t.source_key = 'googleplay' AND t.status = 'active';
    IF gp_before - pr464 > 80 THEN RAISE EXCEPTION '구글 플레이 예외 제외 활성 %(> 80) — 이미 동결선 초과', gp_before - pr464; END IF;
  END IF;
  INSERT INTO _v45_state VALUES (st);
END $$;

-- ── 기록 → 정지(구글 플레이 kr:ko 앵커) → 신규 ───────────────────
INSERT INTO public.review_targets_paused_20261009 (target_id, prev_status, prev_label, total_collected_at_pause, reason)
SELECT t.id, t.status, t.label, t.total_collected,
       'v45 §1 영역 ① 영어 스토어(CEO-staff): 같은 앱 구글 플레이 us:en 신규와 1:1 맞바꾸기 — kr:ko 일시 정지'
  FROM public.review_targets t JOIN _v45_swap s ON s.id = t.id
 WHERE t.status = 'active' AND (SELECT state FROM _v45_state) = 'A'
ON CONFLICT (target_id) DO NOTHING;

CREATE TEMP TABLE _v45_paused_now (id uuid) ON COMMIT DROP;
WITH up AS (
  UPDATE public.review_targets t SET status = 'failed'
    FROM public.review_targets_paused_20261009 l
   WHERE t.id = l.target_id AND l.resumed_at IS NULL AND l.reason LIKE 'v45 §1 %'
     AND t.id IN (SELECT id FROM _v45_swap) AND t.status = 'active'
  RETURNING t.id
)
INSERT INTO _v45_paused_now SELECT id FROM up;

CREATE TEMP TABLE _v45_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, n.source_key, n.product_ref, n.label, 'active', NULL, NULL
    FROM _v45_new n
   WHERE (SELECT state FROM _v45_state) = 'A'
     AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _v45_ins SELECT id, source_key FROM ins;

-- ── 사후 검사 ─────────────────────────────────────────────────
DO $$
DECLARE
  st text; ins_all int; ins_gp int; paused_now int; have_new int; bad_new int; bad_ref int;
  gp_before int; gp_after int; pr464 int; as_active int; all_active int; changed int; swap_info text;
BEGIN
  SELECT state INTO st FROM _v45_state;
  SELECT count(*), count(*) FILTER (WHERE source_key = 'googleplay') INTO ins_all, ins_gp FROM _v45_ins;
  SELECT count(*) INTO paused_now FROM _v45_paused_now;

  -- 대상 행 수 가드(v45): 이번 쓰기 ≤ 10
  IF ins_all + paused_now > 10 THEN RAISE EXCEPTION '이번 쓰기 %행(> 10) — 중단', ins_all + paused_now; END IF;
  IF st = 'A' AND ins_all <> 7 THEN RAISE EXCEPTION '처음 적용인데 신규 %행(기대 7)', ins_all; END IF;
  IF st = 'B' AND (ins_all <> 0 OR paused_now <> 0) THEN RAISE EXCEPTION '재실행인데 쓰기 신규 % · 정지 %(기대 0)', ins_all, paused_now; END IF;

  SELECT count(*) INTO have_new FROM _v45_new n JOIN public.review_targets t
      ON t.source_key = n.source_key AND t.product_ref = n.product_ref AND t.project_id = n.project_id AND t.label = n.label;
  IF have_new <> 7 THEN RAISE EXCEPTION '신규 %행(기대 7)', have_new; END IF;
  SELECT count(*) INTO bad_new FROM public.review_targets t JOIN _v45_ins i ON i.id = t.id
   WHERE t.status <> 'active' OR t.last_run_at IS NOT NULL OR t.consecutive_empty <> 0 OR t.total_collected <> 0
      OR t.cursor IS NOT NULL OR t.last_review_at IS NOT NULL;
  IF bad_new <> 0 THEN RAISE EXCEPTION '새 행 %개가 active·미방문·카운터 0 이 아니다', bad_new; END IF;

  -- 형식(어댑터 parseProductRef: appstore <국가>:<숫자> · googleplay <gl>:<hl>:<패키지>) · 라벨 영역 ①
  SELECT count(*) INTO bad_ref FROM _v45_new n
   WHERE NOT ((n.source_key = 'appstore' AND n.product_ref ~ '^us:[0-9]+$' AND n.label = '1:us|' || n.slug)
           OR (n.source_key = 'googleplay' AND n.product_ref ~ '^us:en:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$' AND n.label = '1:us-en|' || n.slug))
      OR split_part(n.anchor_ref, ':', -1) <> split_part(n.product_ref, ':', -1);
  IF bad_ref <> 0 THEN RAISE EXCEPTION 'ref/label 형식 또는 앵커 ID 불일치 %행', bad_ref; END IF;

  -- 구글 플레이 동결선(한도 예외 금지): 늘지 않음 ∧ 예외 제외 ≤ 80
  SELECT n INTO gp_before FROM _v45_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  SELECT count(*) INTO pr464 FROM public.review_targets t JOIN _v45_pr464 p USING (product_ref)
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF gp_after > gp_before OR gp_after - pr464 > 80 THEN
    SELECT string_agg(label || '=' || status_before, ', ') INTO swap_info FROM _v45_swap;
    RAISE EXCEPTION '구글 플레이 활성 % → %(예외 제외 %) — 동결선 초과. kr:ko 앵커 상태: %(active 가 아니면 맞바꿀 자리가 없다)',
      gp_before, gp_after, gp_after - pr464, swap_info;
  END IF;

  -- 30% 게이트(SHARE_GATE, lib/review/target-supply.ts): 앱스토어 활성 ÷ enabled 소스 활성 ≤ 0.3
  SELECT count(*) FILTER (WHERE t.source_key = 'appstore'), count(*) INTO as_active, all_active
    FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.status = 'active';
  IF as_active > 0.3 * all_active THEN RAISE EXCEPTION '앱스토어 활성 % / 전체 % > 30%%', as_active, all_active; END IF;

  -- 맞바꾸기 2행 밖 두 스토어 기존 행 불변
  SELECT count(*) INTO changed FROM (
    SELECT * FROM _v45_before
    EXCEPT
    SELECT t.id, t.project_id, t.source_key, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
      FROM public.review_targets t WHERE t.source_key IN ('googleplay', 'appstore')
  ) d;
  IF changed <> 0 THEN RAISE EXCEPTION '기존 행 %개가 바뀌었다', changed; END IF;

  RAISE NOTICE 'fathom: 구글 플레이 건너뜀 — 제품 사전 googleplay 칸 ''미발견''(공식 앱 없음, 제3자 가이드 앱만)';
  RAISE NOTICE 'v45 ①[%]: 신규 %(googleplay %) · kr:ko 정지 % · googleplay 활성 %→% (예외 제외 %) · appstore 활성 %/% (%%%)',
    st, ins_all, ins_gp, paused_now, gp_before, gp_after, gp_after - pr464, as_active, all_active,
    CASE WHEN all_active > 0 THEN round(100.0 * as_active / all_active, 1) ELSE 0 END;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- SELECT source_key, label, status, last_run_at FROM public.review_targets WHERE label IN
--   ('1:us|tldv','1:us|avoma','1:us|fathom','1:us|granola','1:us|jamie','1:us-en|avoma','1:us-en|jamie') ORDER BY 1, 2;  -- 기대 7행 active · last_run_at NULL
-- SELECT t.product_ref, t.status, l.prev_status, l.total_collected_at_pause FROM public.review_targets t
--   JOIN public.review_targets_paused_20261009 l ON l.target_id = t.id WHERE l.reason LIKE 'v45 §1 %';                -- 기대 kr:ko 2행 failed(앵커가 active 였다면)
-- SELECT cap_base, daily_request_target, pct_step FROM public.review_source_ramp WHERE source_key IN ('googleplay','appstore');  -- 기대 적용 전과 같음
-- 재실행 멱등: 파일을 한 번 더 → NOTICE 'v45 ①[B]: 신규 0(googleplay 0) · kr:ko 정지 0'.
